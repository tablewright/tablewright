//! A campaign: one folder holding everything a table needs for it. The
//! manifest names its system and the library modules it sees; its scenes
//! are a library under it; its own compendium, when it has one, sits
//! beside them; the pictures opened into it are copied in and named by a
//! path within the folder. Copyable and hostable as one thing. Design:
//! docs/design.md §3 "A campaign is a folder".

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;

use crate::scene::SceneError;
use crate::scenes::{Scenes, slug};

const MANIFEST: &str = "campaign.json";
const SCENES: &str = "scenes";
const ASSETS: &str = "assets";
const COMPENDIUM: &str = "compendium/compendium.sqlite";

/// What a campaign is: its name, the system and version it plays, and
/// the modules it draws its compendium from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignManifest {
    pub name: String,
    pub system: String,
    pub version: String,
    pub modules: Vec<String>,
}

/// A campaign as the intro screen lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CampaignSummary {
    pub name: String,
    pub system: String,
    pub version: String,
    /// The folder, as the app opens it again.
    pub path: String,
}

/// Failures of a campaign folder.
#[derive(Debug, Error)]
pub enum CampaignError {
    #[error("{path}: not a campaign, there is no {MANIFEST}")]
    NotACampaign { path: PathBuf },
    #[error("{path}: already a campaign")]
    AlreadyACampaign { path: PathBuf },
    #[error("{path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("{path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error(transparent)]
    Scene(#[from] SceneError),
}

/// A campaign open from its folder.
#[derive(Debug)]
pub struct Campaign {
    dir: PathBuf,
    manifest: CampaignManifest,
    scenes: Scenes,
}

impl Campaign {
    /// Open the campaign in `dir`.
    ///
    /// # Errors
    ///
    /// `NotACampaign` when the folder has no manifest; otherwise a manifest
    /// that cannot be read, or scenes that will not open.
    pub fn open(dir: &Path) -> Result<Self, CampaignError> {
        let path = dir.join(MANIFEST);
        if !path.is_file() {
            return Err(CampaignError::NotACampaign {
                path: dir.to_path_buf(),
            });
        }
        let text = std::fs::read_to_string(&path).map_err(|source| io(&path, source))?;
        let manifest = serde_json::from_str(&text).map_err(|source| CampaignError::Json {
            path: path.clone(),
            source,
        })?;
        let scenes = Scenes::open(&dir.join(SCENES))?;
        Ok(Self {
            dir: dir.to_path_buf(),
            manifest,
            scenes,
        })
    }

    /// Make a campaign in `dir`: the folder, its manifest, and its first
    /// scene, the tavern.
    ///
    /// # Errors
    ///
    /// `AlreadyACampaign` when `dir` holds one; otherwise what cannot be
    /// written.
    pub fn create(dir: &Path, manifest: CampaignManifest) -> Result<Self, CampaignError> {
        let path = dir.join(MANIFEST);
        if path.exists() {
            return Err(CampaignError::AlreadyACampaign {
                path: dir.to_path_buf(),
            });
        }
        std::fs::create_dir_all(dir).map_err(|source| io(dir, source))?;
        let text =
            serde_json::to_string_pretty(&manifest).map_err(|source| CampaignError::Json {
                path: path.clone(),
                source,
            })?;
        std::fs::write(&path, text).map_err(|source| io(&path, source))?;
        let scenes = Scenes::open(&dir.join(SCENES))?;
        Ok(Self {
            dir: dir.to_path_buf(),
            manifest,
            scenes,
        })
    }

    /// Where a new campaign named `name` goes under `root`: its name as a
    /// slug, made unique by a number when the folder is taken.
    pub fn place(root: &Path, name: &str) -> PathBuf {
        let base = slug(name);
        let mut dir = root.join(&base);
        let mut n = 2;
        while dir.exists() {
            dir = root.join(format!("{base}-{n}"));
            n += 1;
        }
        dir
    }

    /// The campaign's folder.
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn manifest(&self) -> &CampaignManifest {
        &self.manifest
    }

    /// The campaign as the intro lists it.
    pub fn summary(&self) -> CampaignSummary {
        CampaignSummary {
            name: self.manifest.name.clone(),
            system: self.manifest.system.clone(),
            version: self.manifest.version.clone(),
            path: self.dir.to_string_lossy().into_owned(),
        }
    }

    /// The campaign's scenes.
    pub fn scenes(&self) -> &Scenes {
        &self.scenes
    }

    /// The campaign's scenes, to edit.
    pub fn scenes_mut(&mut self) -> &mut Scenes {
        &mut self.scenes
    }

    /// Copy `source` into the campaign's assets and name it by its path
    /// within the campaign, forward slashes, unique by a number when the
    /// name is taken.
    ///
    /// # Errors
    ///
    /// Fails if `source` has no file name or cannot be copied.
    pub fn take_asset(&self, source: &Path) -> Result<String, CampaignError> {
        let assets = self.dir.join(ASSETS);
        std::fs::create_dir_all(&assets).map_err(|source| io(&assets, source))?;
        let (stem, extension) = match (source.file_stem(), source.extension()) {
            (Some(stem), extension) => (
                stem.to_string_lossy().into_owned(),
                extension.map(|e| format!(".{}", e.to_string_lossy())),
            ),
            (None, _) => {
                return Err(io(
                    source,
                    std::io::Error::new(std::io::ErrorKind::InvalidInput, "no file name"),
                ));
            }
        };
        let extension = extension.unwrap_or_default();
        let mut name = format!("{stem}{extension}");
        let mut n = 2;
        while assets.join(&name).exists() {
            name = format!("{stem}-{n}{extension}");
            n += 1;
        }
        let target = assets.join(&name);
        std::fs::copy(source, &target).map_err(|source| io(&target, source))?;
        Ok(format!("{ASSETS}/{name}"))
    }

    /// A path within the campaign as a path on disk.
    pub fn resolve(&self, relative: &str) -> PathBuf {
        self.dir.join(relative)
    }

    /// The campaign's own compendium store, when it has one.
    pub fn compendium_path(&self) -> Option<PathBuf> {
        let path = self.dir.join(COMPENDIUM);
        path.is_file().then_some(path)
    }
}

/// The campaigns under `root` and at `known` paths, by name, each once;
/// a folder that is not a campaign is left out.
pub fn list(root: &Path, known: &[PathBuf]) -> Vec<CampaignSummary> {
    let mut candidates: Vec<PathBuf> = known.to_vec();
    if let Ok(entries) = std::fs::read_dir(root) {
        candidates.extend(entries.flatten().map(|entry| entry.path()));
    }
    let mut seen = HashSet::new();
    let mut summaries = Vec::new();
    for dir in candidates {
        let key = dir.canonicalize().unwrap_or_else(|_| dir.clone());
        if !seen.insert(key) {
            continue;
        }
        if let Some(summary) = summary_of(&dir) {
            summaries.push(summary);
        }
    }
    summaries.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.path.cmp(&b.path)));
    summaries
}

fn summary_of(dir: &Path) -> Option<CampaignSummary> {
    let text = std::fs::read_to_string(dir.join(MANIFEST)).ok()?;
    let manifest: CampaignManifest = serde_json::from_str(&text).ok()?;
    Some(CampaignSummary {
        name: manifest.name,
        system: manifest.system,
        version: manifest.version,
        path: dir.to_string_lossy().into_owned(),
    })
}

fn io(path: &Path, source: std::io::Error) -> CampaignError {
    CampaignError::Io {
        path: path.to_path_buf(),
        source,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("tablewright-campaign-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch");
        dir
    }

    fn manifest(name: &str) -> CampaignManifest {
        CampaignManifest {
            name: name.into(),
            system: "5e".into(),
            version: "2024".into(),
            modules: vec!["5e-2024-srd".into()],
        }
    }

    #[test]
    fn a_created_campaign_opens_again_with_its_manifest_and_a_first_scene() {
        let root = scratch("create");
        let dir = Campaign::place(&root, "Halloway House");
        assert_eq!(dir, root.join("halloway-house"));
        let made = Campaign::create(&dir, manifest("Halloway House")).expect("create");
        assert_eq!(made.scenes().current().id, "tavern");
        let opened = Campaign::open(&dir).expect("open");
        assert_eq!(opened.manifest(), &manifest("Halloway House"));
        assert_eq!(opened.summary().path, dir.to_string_lossy());
        assert!(matches!(
            Campaign::create(&dir, manifest("Again")),
            Err(CampaignError::AlreadyACampaign { .. })
        ));
        assert_eq!(
            Campaign::place(&root, "Halloway House"),
            root.join("halloway-house-2")
        );
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn a_folder_without_a_manifest_is_not_a_campaign() {
        let root = scratch("empty");
        assert!(matches!(
            Campaign::open(&root),
            Err(CampaignError::NotACampaign { .. })
        ));
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn a_picture_taken_in_is_copied_and_named_within_the_campaign() {
        let root = scratch("asset");
        let source = root.join("mansion.png");
        std::fs::write(&source, b"png").expect("source");
        let campaign = Campaign::create(&root.join("c"), manifest("Assets")).expect("create");
        assert_eq!(
            campaign.take_asset(&source).expect("take"),
            "assets/mansion.png"
        );
        assert_eq!(
            campaign.take_asset(&source).expect("take again"),
            "assets/mansion-2.png"
        );
        assert_eq!(
            std::fs::read(campaign.resolve("assets/mansion-2.png")).expect("copied"),
            b"png"
        );
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn the_list_finds_campaigns_under_the_root_and_at_known_paths_once_each() {
        let root = scratch("list");
        let home = root.join("campaigns");
        Campaign::create(&home.join("b"), manifest("Beta")).expect("beta");
        Campaign::create(&home.join("a"), manifest("Alpha")).expect("alpha");
        std::fs::create_dir_all(home.join("not-a-campaign")).expect("stray");
        let elsewhere = root.join("elsewhere").join("gamma");
        Campaign::create(&elsewhere, manifest("Gamma")).expect("gamma");
        let listed = list(&home, &[elsewhere.clone(), home.join("a")]);
        let names: Vec<&str> = listed.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["Alpha", "Beta", "Gamma"]);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }
}
