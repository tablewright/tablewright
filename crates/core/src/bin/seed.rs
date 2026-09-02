//! Seeds a compendium SQLite file from a module directory, through the
//! store API, so the store format lives in exactly one place.
//!
//! Usage: `seed <module directory> <output.sqlite>`. The output is
//! rewritten from scratch on every run.

use std::collections::BTreeMap;
use std::error::Error;
use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

use tablewright_core::{Store, read_module};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [module_dir, output] = args.as_slice() else {
        eprintln!("usage: seed <module directory> <output.sqlite>");
        return ExitCode::from(2);
    };
    match run(Path::new(module_dir), Path::new(output)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("seed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(module_dir: &Path, output: &Path) -> Result<(), Box<dyn Error>> {
    let started = Instant::now();
    let module = read_module(module_dir)?;
    remove_previous(output)?;
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut store = Store::open(output)?;
    store.put_module(&module.manifest)?;
    let written = store.upsert_all(&module.entries)?;
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
