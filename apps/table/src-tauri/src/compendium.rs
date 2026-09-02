//! Where the compendium lives on this machine. The bundled SRD ships as an
//! app resource and is copied into the app data directory on first run, so
//! the app never writes inside its own install and a newer bundle replaces
//! an older copy on the next start.
//! Design: docs/design.md §3 "Systems and modules".

use std::io;
use std::path::{Path, PathBuf};

/// The bundled compendium, relative to the resource directory.
pub const BUNDLED: &str = "resources/compendium/5e-2024-srd.sqlite";

/// Installs `bundled` under `data_dir/compendium/` unless an up-to-date copy
/// is already there, and returns the installed path.
///
/// # Errors
///
/// Fails if the bundle is missing or the copy cannot be written.
pub fn install(bundled: &Path, data_dir: &Path) -> io::Result<PathBuf> {
    let name = bundled.file_name().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "bundle path has no file name")
    })?;
    let target_dir = data_dir.join("compendium");
    let target = target_dir.join(name);
    if !is_current(bundled, &target)? {
        std::fs::create_dir_all(&target_dir)?;
        std::fs::copy(bundled, &target)?;
    }
    Ok(target)
}

// The copy is current when it exists and is at least as new as the bundle.
fn is_current(bundled: &Path, target: &Path) -> io::Result<bool> {
    let Ok(installed) = std::fs::metadata(target) else {
        return Ok(false);
    };
    let bundle = std::fs::metadata(bundled)?;
    match (bundle.modified(), installed.modified()) {
        (Ok(bundled_at), Ok(installed_at)) => Ok(installed_at >= bundled_at),
        _ => Ok(bundle.len() == installed.len()),
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
        assert_eq!(std::fs::read(&installed).expect("read"), b"v1");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn a_current_copy_is_left_alone_and_a_newer_bundle_replaces_it() {
        let dir = scratch();
        let bundled = dir.join("bundle.sqlite");
        std::fs::write(&bundled, b"v1").expect("bundle");
        let installed = install(&bundled, &dir.join("data")).expect("install");
        std::fs::write(&installed, b"edited").expect("edit");
        install(&bundled, &dir.join("data")).expect("reinstall");
        assert_eq!(
            std::fs::read(&installed).expect("read"),
            b"edited",
            "older bundle left the copy"
        );

        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&bundled, b"v2").expect("newer bundle");
        install(&bundled, &dir.join("data")).expect("upgrade");
        assert_eq!(
            std::fs::read(&installed).expect("read"),
            b"v2",
            "newer bundle replaced the copy"
        );
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
