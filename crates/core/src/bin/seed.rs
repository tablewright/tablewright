//! Seeds a compendium SQLite file from module directories, through the
//! store API, so the store format lives in exactly one place.
//!
//! Usage: `seed <output.sqlite> <system.json> <module directory>...`. The
//! output is rewritten from scratch on every run and holds every module
//! given, in order. Each entry's facets and parts are read from its data by
//! the system manifest unless the entry file already names them, an entry
//! that does not say who may see it takes its kind's default, and the
//! manifest itself is stored so the app can read kinds, facets and
//! controls from the store.

use std::collections::BTreeMap;
use std::error::Error;
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

use tablewright_core::{Store, SystemManifest, read_module};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [output, system, modules @ ..] = args.as_slice() else {
        eprintln!("usage: seed <output.sqlite> <system.json> <module directory>...");
        return ExitCode::from(2);
    };
    if modules.is_empty() {
        eprintln!("usage: seed <output.sqlite> <system.json> <module directory>...");
        return ExitCode::from(2);
    }
    let modules: Vec<&Path> = modules.iter().map(Path::new).collect();
    match run(Path::new(output), Path::new(system), &modules) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("seed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(output: &Path, system: &Path, module_dirs: &[&Path]) -> Result<(), Box<dyn Error>> {
    let started = Instant::now();
    let manifest = SystemManifest::load(system)?;
    remove_previous(output)?;
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut store = Store::open(output)?;
    store.put_system(&manifest)?;
    let mut by_kind: BTreeMap<String, usize> = BTreeMap::new();
    let mut written = 0;
    for module_dir in module_dirs {
        let mut module = read_module(module_dir, Some(&manifest))?;
        let mut faceted = 0;
        let mut parted = 0;
        for entry in &mut module.entries {
            if entry.facets.is_empty() {
                entry.facets = manifest.facets_for(&entry.kind, &entry.data);
                faceted += usize::from(!entry.facets.is_empty());
            }
            if entry.parts.is_empty() {
                entry.parts = manifest.parts_for(&entry.kind, &entry.data);
                parted += entry.parts.len();
            }
            *by_kind.entry(entry.kind.clone()).or_default() += 1;
        }
        store.put_module(&module.manifest)?;
        written += store.upsert_all(&module.entries)?;
        println!(
            "{}: {} entries, facets for {faceted}, {parted} parts, from {}",
            module.manifest.id,
            module.entries.len(),
            module_dir.display()
        );
    }
    store.seal()?;
    drop(store);

    let kinds: Vec<String> = by_kind
        .iter()
        .map(|(kind, count)| format!("{count} {kind}"))
        .collect();
    let size = std::fs::metadata(output)?.len();
    println!(
        "{}: {written} entries ({}) -> {} ({} KB) in {} ms",
        manifest.id,
        kinds.join(", "),
        output.display(),
        size / 1024,
        started.elapsed().as_millis()
    );
    Ok(())
}

// A stale database, or its write-ahead log, must not bleed into the new one.
fn remove_previous(output: &Path) -> std::io::Result<()> {
    for suffix in ["", "-wal", "-shm"] {
        let mut name = output.as_os_str().to_owned();
        name.push(suffix);
        match std::fs::remove_file(&name) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}
