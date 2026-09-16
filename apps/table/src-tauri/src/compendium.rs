//! How the bundled SRD reaches the library. It ships as an app resource
//! and is copied into the library under the Tablewright home on first run,
//! so the app never writes inside its own install and a newer bundle
//! replaces an older copy on the next start.
//! Design: docs/design.md §3 "Systems and modules".

use std::io;
use std::path::{Path, PathBuf};

/// The bundled compendium, relative to the resource directory.
pub const BUNDLED: &str = "resources/compendium/5e-srd.sqlite";

/// SQLite's sidecars: the write-ahead log and its shared-memory index.
const SIDECARS: [&str; 2] = ["-wal", "-shm"];

/// Installs `bundled` under `data_dir/compendium/` unless an up-to-date copy
/// is already there, and returns the installed path.
///
/// # Errors
///
/// Fails if the bundle is missing or the copy cannot be written.
pub fn install(bundled: &Path, data_dir: &Path) -> io::Result<PathBuf> {
    let target = target_path(bundled, data_dir)?;
    if !is_current(bundled, &target)? {
        replace(bundled, &target)?;
    }
    Ok(target)
}

/// Replaces the installed copy with `bundled` whatever its age: the way
/// back when the copy will not open.
///
/// # Errors
///
/// Fails if the bundle is missing or the copy cannot be written.
pub fn reinstall(bundled: &Path, data_dir: &Path) -> io::Result<PathBuf> {
    let target = target_path(bundled, data_dir)?;
    replace(bundled, &target)?;
    Ok(target)
}

fn target_path(bundled: &Path, data_dir: &Path) -> io::Result<PathBuf> {
    let name = bundled.file_name().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "bundle path has no file name")
    })?;
    Ok(data_dir.join("compendium").join(name))
}

// A stale log beside the file would be applied to the new one on open and
// corrupt it, so the sidecars go first and the file arrives by rename.
fn replace(bundled: &Path, target: &Path) -> io::Result<()> {
    let dir = target.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "install path has no directory")
    })?;
    std::fs::create_dir_all(dir)?;
    for suffix in SIDECARS {
        remove_if_present(&with_suffix(target, suffix))?;
    }
    let staging = with_suffix(target, ".new");
    std::fs::copy(bundled, &staging)?;
    std::fs::rename(&staging, target)
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

fn remove_if_present(path: &Path) -> io::Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

// The copy is current when it exists, is the bundle's size (a cut-short copy
// is not), and is at least as new as the bundle.
fn is_current(bundled: &Path, target: &Path) -> io::Result<bool> {
    let Ok(installed) = std::fs::metadata(target) else {
        return Ok(false);
    };
    let bundle = std::fs::metadata(bundled)?;
    if bundle.len() != installed.len() {
        return Ok(false);
    }
    match (bundle.modified(), installed.modified()) {
        (Ok(bundled_at), Ok(installed_at)) => Ok(installed_at >= bundled_at),
        _ => Ok(true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT: AtomicUsize = AtomicUsize::new(0);

    fn scratch() -> PathBuf {
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("tablewright-install-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    fn read(path: &Path) -> Vec<u8> {
        std::fs::read(path).expect("read")
    }

    // A later write with a later mtime, as the app's own open leaves behind.
    fn touch(path: &Path, content: &[u8]) {
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(path, content).expect("write");
    }

    #[test]
    fn first_run_copies_the_bundle_into_the_data_directory() {
        let dir = scratch();
        let bundled = dir.join("bundle.sqlite");
        std::fs::write(&bundled, b"v1").expect("bundle");
        let installed = install(&bundled, &dir.join("data")).expect("install");
        assert_eq!(
            installed,
            dir.join("data").join("compendium").join("bundle.sqlite")
        );
        assert_eq!(read(&installed), b"v1");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn a_current_copy_is_left_alone_and_a_newer_bundle_replaces_it() {
        let dir = scratch();
        let bundled = dir.join("bundle.sqlite");
        std::fs::write(&bundled, b"v1").expect("bundle");
        let installed = install(&bundled, &dir.join("data")).expect("install");
        touch(&installed, b"x1");
        install(&bundled, &dir.join("data")).expect("reinstall");
        assert_eq!(read(&installed), b"x1", "older bundle left the copy");

        touch(&bundled, b"v2");
        install(&bundled, &dir.join("data")).expect("upgrade");
        assert_eq!(read(&installed), b"v2", "newer bundle replaced the copy");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn a_copy_of_another_size_is_replaced_whatever_its_age() {
        let dir = scratch();
        let bundled = dir.join("bundle.sqlite");
        std::fs::write(&bundled, b"v1").expect("bundle");
        let installed = install(&bundled, &dir.join("data")).expect("install");
        touch(&installed, b"cut short");
        install(&bundled, &dir.join("data")).expect("repair");
        assert_eq!(read(&installed), b"v1");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn replacing_the_copy_removes_the_old_sidecars() {
        let dir = scratch();
        let bundled = dir.join("bundle.sqlite");
        std::fs::write(&bundled, b"v1").expect("bundle");
        let installed = install(&bundled, &dir.join("data")).expect("install");
        let wal = with_suffix(&installed, "-wal");
        let shm = with_suffix(&installed, "-shm");
        std::fs::write(&wal, b"stale frames").expect("wal");
        std::fs::write(&shm, b"stale index").expect("shm");

        touch(&bundled, b"v2");
        install(&bundled, &dir.join("data")).expect("upgrade");
        assert_eq!(read(&installed), b"v2");
        assert!(!wal.exists(), "the old log is gone");
        assert!(!shm.exists(), "the old shared memory is gone");
        assert!(
            !with_suffix(&installed, ".new").exists(),
            "no staging file left"
        );
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn reinstall_replaces_a_current_copy() {
        let dir = scratch();
        let bundled = dir.join("bundle.sqlite");
        std::fs::write(&bundled, b"v1").expect("bundle");
        let installed = install(&bundled, &dir.join("data")).expect("install");
        touch(&installed, b"x1");
        reinstall(&bundled, &dir.join("data")).expect("reinstall");
        assert_eq!(read(&installed), b"v1");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn a_missing_bundle_is_an_error() {
        let dir = scratch();
        let error = install(&dir.join("missing.sqlite"), &dir.join("data")).expect_err("missing");
        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }
}
