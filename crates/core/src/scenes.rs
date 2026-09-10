//! The scene library: one JSON file per scene under a directory, and
//! which of them the table has open. The open scene is the document
//! every command edits; switching loads another file and remembers it,
//! so the table comes back to the scene it was on. Design: docs/design.md
//! §5 "A scene is one map".

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::scene::{Scene, SceneError};
use crate::stroke::Stroke;

/// A scene as the list shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SceneSummary {
    pub id: String,
    pub name: String,
}

// The file naming the scene last open, beside the scene files.
const POINTER: &str = "current";

/// The scenes on disk and the one open.
#[derive(Debug)]
pub struct Scenes {
    dir: PathBuf,
    current: Scene,
}

impl Scenes {
    /// Open the library at `dir`, creating it if need be, on the scene last
    /// open, else the first by name, else the tavern, which is then saved
    /// as the library's first scene.
    ///
    /// # Errors
    ///
    /// Fails if the directory cannot be created or read, or the seed cannot
    /// be written.
    pub fn open(dir: &Path) -> Result<Self, SceneError> {
        std::fs::create_dir_all(dir).map_err(|source| io(dir, source))?;
        let mut scenes = Self {
            dir: dir.to_path_buf(),
            current: Scene::tavern(),
        };
        match scenes.last_open()? {
            Some(scene) => scenes.current = scene,
            None => scenes.save()?,
        }
        Ok(scenes)
    }

    /// The scene open.
    pub fn current(&self) -> &Scene {
        &self.current
    }

    /// The scene open, to edit; `save` afterwards.
    pub fn current_mut(&mut self) -> &mut Scene {
        &mut self.current
    }

    /// Every scene in the library, by name. A file whose scene does not
    /// carry the file's name as its id is not a scene of the library.
    ///
    /// # Errors
    ///
    /// Fails if the directory cannot be read.
    pub fn list(&self) -> Result<Vec<SceneSummary>, SceneError> {
        let entries = std::fs::read_dir(&self.dir).map_err(|source| io(&self.dir, source))?;
        let mut summaries = Vec::new();
        for entry in entries {
            let path = entry.map_err(|source| io(&self.dir, source))?.path();
            if path.extension().is_none_or(|extension| extension != "json") {
                continue;
            }
            let Ok(scene) = Scene::load(&path) else {
                continue;
            };
            if path
                .file_stem()
                .is_some_and(|stem| stem == scene.id.as_str())
            {
                summaries.push(SceneSummary {
                    id: scene.id,
                    name: scene.name,
                });
            }
        }
        summaries.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
        Ok(summaries)
    }

    /// Write the open scene to its file and remember it as the one open.
    ///
    /// # Errors
    ///
    /// Fails if either file cannot be written.
    pub fn save(&self) -> Result<(), SceneError> {
        self.current.save(&self.path_of(&self.current.id))?;
        self.remember()
    }

    /// Open the scene `id`; the one open until now stays as last saved.
    ///
    /// # Errors
    ///
    /// `NoScene` when no scene file has that id; a load failure otherwise.
    pub fn open_scene(&mut self, id: &str) -> Result<&Scene, SceneError> {
        let path = self.path_of(id);
        if !path.is_file() {
            return Err(SceneError::NoScene(id.to_owned()));
        }
        self.current = Scene::load(&path)?;
        self.remember()?;
        Ok(&self.current)
    }

    /// Create a scene named `name` with `strokes` drawn on the tavern's
    /// grid, save it, and open it. Its id is the name as a slug, made
    /// unique by a number when the name is taken.
    ///
    /// # Errors
    ///
    /// Fails if the scene cannot be written.
    pub fn create(&mut self, name: &str, strokes: Vec<Stroke>) -> Result<&Scene, SceneError> {
        let id = self.free_id(&slug(name));
        self.current = Scene::blank(&id, name, strokes);
        self.save()?;
        Ok(&self.current)
    }

    fn path_of(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.json"))
    }

    fn free_id(&self, slug: &str) -> String {
        let mut id = slug.to_owned();
        let mut n = 2;
        while self.path_of(&id).exists() {
            id = format!("{slug}-{n}");
            n += 1;
        }
        id
    }

    fn remember(&self) -> Result<(), SceneError> {
        let pointer = self.dir.join(POINTER);
        std::fs::write(&pointer, &self.current.id).map_err(|source| io(&pointer, source))
    }

    // The pointer names the scene to come back to; without one, or with
    // one naming a scene that is gone or will not load, the first by name
    // among those that do; none if there is no such scene. A file that
    // will not load is not the library's problem: it is left where it is.
    fn last_open(&self) -> Result<Option<Scene>, SceneError> {
        if let Ok(id) = std::fs::read_to_string(self.dir.join(POINTER)) {
            if let Ok(scene) = Scene::load(&self.path_of(id.trim())) {
                return Ok(Some(scene));
            }
        }
        match self.list()?.first() {
            Some(first) => Scene::load(&self.path_of(&first.id)).map(Some),
            None => Ok(None),
        }
    }
}

/// A name as a file name: "Halloway House" is `halloway-house`; a name
/// with nothing to keep is `scene`.
pub fn slug(name: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for c in name.chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() { "scene".into() } else { out }
}

fn io(path: &Path, source: std::io::Error) -> SceneError {
    SceneError::Io {
        path: path.to_path_buf(),
        source,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compendium::Visibility;
    use crate::stroke::{Edge, Look, OpeningSize, Side, ThresholdKind, ThresholdState};

    fn library(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("tablewright-scenes-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn an_empty_library_opens_on_the_tavern_and_keeps_it() {
        let dir = library("empty");
        let scenes = Scenes::open(&dir).expect("open");
        assert_eq!(scenes.current().id, "tavern");
        assert!(dir.join("tavern.json").is_file());
        assert_eq!(
            std::fs::read_to_string(dir.join(POINTER)).expect("pointer"),
            "tavern"
        );
        assert_eq!(
            scenes.list().expect("list"),
            vec![SceneSummary {
                id: "tavern".into(),
                name: "The Rusty Flagon".into()
            }]
        );
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn a_created_scene_is_open_listed_by_name_and_named_uniquely() {
        let dir = library("create");
        let mut scenes = Scenes::open(&dir).expect("open");
        let secret = Stroke::Threshold {
            edge: Edge {
                col: 3,
                row: 3,
                side: Side::East,
            },
            kind: ThresholdKind::Door,
            state: ThresholdState::Secret,
            size: OpeningSize::Small,
            look: Look::Data,
            visibility: Visibility::Party,
        };
        let created = scenes
            .create("Halloway House", vec![secret])
            .expect("create");
        assert_eq!(
            (created.id.as_str(), created.name.as_str()),
            ("halloway-house", "Halloway House")
        );
        assert!(created.tokens.is_empty());
        // Drawn as if added one by one, so a secret threshold is the DM's.
        assert_eq!(created.strokes[0].visibility(), Visibility::Dm);
        let again = scenes
            .create("Halloway House", Vec::new())
            .expect("create again");
        assert_eq!(again.id, "halloway-house-2");
        let names: Vec<String> = scenes
            .list()
            .expect("list")
            .into_iter()
            .map(|s| s.id)
            .collect();
        assert_eq!(names, ["halloway-house", "halloway-house-2", "tavern"]);
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn switching_scenes_is_remembered_across_opens() {
        let dir = library("switch");
        let mut scenes = Scenes::open(&dir).expect("open");
        scenes.create("Terrace Hill", Vec::new()).expect("create");
        assert_eq!(
            scenes.open_scene("tavern").expect("open tavern").id,
            "tavern"
        );
        assert_eq!(
            scenes.open_scene("terrace-hill").expect("open hill").id,
            "terrace-hill"
        );
        assert!(matches!(
            scenes.open_scene("nowhere"),
            Err(SceneError::NoScene(_))
        ));
        let reopened = Scenes::open(&dir).expect("reopen");
        assert_eq!(reopened.current().id, "terrace-hill");
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn a_pointed_at_file_that_will_not_load_is_skipped_and_the_library_still_opens() {
        let dir = library("stale");
        std::fs::create_dir_all(&dir).expect("dir");
        std::fs::write(dir.join("halloway-house.json"), "{ not a scene }").expect("stale");
        std::fs::write(dir.join(POINTER), "halloway-house").expect("pointer");
        let scenes = Scenes::open(&dir).expect("opens on the tavern");
        assert_eq!(scenes.current().id, "tavern");
        let ids: Vec<String> = scenes
            .list()
            .expect("list")
            .into_iter()
            .map(|s| s.id)
            .collect();
        assert_eq!(ids, ["tavern"]);
        assert!(dir.join("halloway-house.json").is_file());
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn a_file_whose_scene_has_another_id_is_not_listed() {
        let dir = library("stray");
        let scenes = Scenes::open(&dir).expect("open");
        Scene::tavern()
            .save(&dir.join("current.json"))
            .expect("stray");
        let ids: Vec<String> = scenes
            .list()
            .expect("list")
            .into_iter()
            .map(|s| s.id)
            .collect();
        assert_eq!(ids, ["tavern"]);
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn a_name_becomes_a_slug() {
        assert_eq!(slug("Halloway House"), "halloway-house");
        assert_eq!(slug("  The Rusty Flagon!  "), "the-rusty-flagon");
        assert_eq!(slug("Étage 2 -- nord"), "étage-2-nord");
        assert_eq!(slug("???"), "scene");
    }
}
