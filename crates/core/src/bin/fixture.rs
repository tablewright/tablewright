//! Writes the cast of the stand-in (design.md §3 "The stand-in's cast").
//!
//! Usage: `fixture <compendium.sqlite> <cast.json> <output.json>`, where
//! the cast names things as `<kind>:<slug>`. The compendium is read from a
//! copy, since opening a store turns its write-ahead log on and the sealed
//! bundle must stay as the seed left it. The output is committed, and CI
//! fails when it is stale, as it does for the bindings.

use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use tablewright_core::{Cast, Store};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [compendium, cast, output] = args.as_slice() else {
        eprintln!("usage: fixture <compendium.sqlite> <cast.json> <output.json>");
        return ExitCode::from(2);
    };
    match run(Path::new(compendium), Path::new(cast), Path::new(output)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("fixture: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(compendium: &Path, cast: &Path, output: &Path) -> Result<(), Box<dyn Error>> {
    let things: Vec<String> = serde_json::from_str(&std::fs::read_to_string(cast)?)?;
    let scratch = Scratch::copy_of(compendium)?;
    let cast = Cast::read(Store::open(&scratch.path)?, &things)?;
    drop(scratch);
    let mut text = serde_json::to_string_pretty(&cast)?;
    text.push('\n');
    std::fs::write(output, text)?;
    let size = std::fs::metadata(output)?.len();
    println!(
        "fixture: {} things, {} entries -> {} ({} KB)",
        things.len(),
        cast.entries.len(),
        output.display(),
        size / 1024
    );
    Ok(())
}

// A copy of the sealed compendium in a scratch folder, removed with it
// once the store reading it has closed.
struct Scratch {
    dir: PathBuf,
    path: PathBuf,
}

impl Scratch {
    fn copy_of(compendium: &Path) -> std::io::Result<Self> {
        let dir = std::env::temp_dir().join(format!("tablewright-fixture-{}", std::process::id()));
        std::fs::create_dir_all(&dir)?;
        let path = dir.join("compendium.sqlite");
        std::fs::copy(compendium, &path)?;
        Ok(Self { dir, path })
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_dir_all(&self.dir) {
            eprintln!(
                "fixture: the scratch copy is left at {}: {error}",
                self.dir.display()
            );
        }
    }
}
