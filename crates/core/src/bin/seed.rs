//! Seeds a compendium SQLite file from a module directory, through the
//! store API, so the store format lives in exactly one place.
//!
//! Usage: `seed <module directory> <output.sqlite> [system.json]`. The
//! output is rewritten from scratch on every run. With a system manifest,
//! each entry's facets are read from its data by the manifest's specs
//! unless the entry file already names them, an entry that does not say
//! who may see it takes its kind's default, and the manifest itself is
//! stored so the app can read kinds, facets and controls from the store.

use std::collections::BTreeMap;
use std::error::Error;
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

use tablewright_core::{Store, SystemManifest, read_module};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (module_dir, output, system) = match args.as_slice() {
        [module_dir, output] => (module_dir, output, None),
        [module_dir, output, system] => (module_dir, output, Some(Path::new(system))),
        _ => {
            eprintln!("usage: seed <module directory> <output.sqlite> [system.json]");
            return ExitCode::from(2);
        }
    };
    match run(Path::new(module_dir), Path::new(output), system) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("seed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(module_dir: &Path, output: &Path, system: Option<&Path>) -> Result<(), Box<dyn Error>> {
    let started = Instant::now();
    let manifest = system.map(SystemManifest::load).transpose()?;
    let mut module = read_module(module_dir, manifest.as_ref())?;
    if let (Some(manifest), Some(system)) = (&manifest, system) {
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
        }
        println!(
            "{}: facets for {faceted} entries, {parted} parts, from {}",
            manifest.id,
            system.display()
        );
    }
    remove_previous(output)?;
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut store = Store::open(output)?;
    store.put_module(&module.manifest)?;
    if let Some(manifest) = &manifest {
        store.put_system(manifest)?;
    }
    let written = store.upsert_all(&module.entries)?;
    store.seal()?;
    drop(store);

    let mut by_kind: BTreeMap<&str, usize> = BTreeMap::new();
    for entry in &module.entries {
        *by_kind.entry(entry.kind.as_str()).or_default() += 1;
    }
    let kinds: Vec<String> = by_kind
        .iter()
        .map(|(kind, count)| format!("{count} {kind}"))
        .collect();
    let size = std::fs::metadata(output)?.len();
    println!(
        "{}: {written} entries ({}) -> {} ({} KB) in {} ms",
        module.manifest.id,
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
