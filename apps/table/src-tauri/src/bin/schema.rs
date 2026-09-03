//! Writes the TypeScript bindings for the Table command surface to
//! packages/schema/src/bindings.ts. Run as `bun run schema`.

use std::path::Path;
use std::process::ExitCode;

fn main() -> ExitCode {
    let path = Path::new(table_lib::BINDINGS_PATH);
    match table_lib::export_bindings(path) {
        Ok(()) => {
            println!("bindings: {}", path.display());
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("bindings: {error}");
            ExitCode::FAILURE
        }
    }
}

// This test lives in the binary rather than the library on purpose. Anything
// that links Tauri's runtime needs the Windows manifest that tauri-build
// attaches to binaries (Common Controls 6, for `TaskDialogIndirect`); the
// library's test harness gets no manifest and fails to load on Windows.
#[cfg(test)]
mod tests {
    // The committed bindings must be what the current command surface
    // exports, or the frontend is typed against something that no longer
    // exists.
    #[test]
    fn committed_bindings_match_the_command_surface() {
        let dir = std::env::temp_dir().join(format!("tablewright-bindings-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let fresh_path = dir.join("bindings.ts");
        table_lib::export_bindings(&fresh_path).expect("export");
        let fresh = std::fs::read_to_string(&fresh_path).expect("read export");
        std::fs::remove_dir_all(&dir).expect("cleanup");
        let committed = std::fs::read_to_string(table_lib::BINDINGS_PATH).unwrap_or_default();
        assert!(
            committed == fresh,
            "packages/schema/src/bindings.ts is stale; run `bun run schema`"
        );
    }
}
