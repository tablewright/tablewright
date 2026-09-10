//! What the shell holds for the lifetime of the app: where campaigns live,
//! which are known, and the session open, a campaign with its compendium.
//! The session is opened from the intro screen and closed back to it; every
//! command that needs a campaign asks for the session and says so when
//! there is none.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tablewright_core::{
    Campaign, CampaignError, CampaignSummary, Catalogue, Store, StoreError, SystemManifest,
};

use crate::compendium;

// The app's own memory: the campaigns it knows, and the one open.
const KNOWN: &str = "campaigns.json";
const CURRENT: &str = "campaign";

/// An open compendium, its catalogue, and the system it was seeded for.
pub struct Compendium {
    /// SQLite connections are not `Sync`; the mutex makes the state shareable.
    pub store: Mutex<Store>,
    pub catalogue: Catalogue,
    /// The manifest the seeder was given, if any: kinds, facets, controls.
    pub system: Option<SystemManifest>,
}

impl Compendium {
    /// Open the compendium at `path` and build its catalogue.
    ///
    /// # Errors
    ///
    /// Fails if the file cannot be opened or read.
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        let store = Store::open(path)?;
        let catalogue = Catalogue::from_store(&store)?;
        let system = store.system()?;
        Ok(Self {
            store: Mutex::new(store),
            catalogue,
            system,
        })
    }
}

/// A campaign at the table, with its compendium when one could be opened.
pub struct Session {
    pub campaign: Campaign,
    pub compendium: Option<Compendium>,
}

/// The managed state.
pub struct AppState {
    /// The Tablewright home: campaigns go under `campaigns/` unless the DM
    /// puts one elsewhere.
    pub home: PathBuf,
    /// The app's own data directory: the list of campaigns and the one open.
    pub data_dir: PathBuf,
    /// The bundled compendium, when the resource resolved.
    pub bundled: Option<PathBuf>,
    /// Campaign folders opened before, wherever they are.
    pub known: Mutex<Vec<PathBuf>>,
    pub session: Mutex<Option<Session>>,
}

impl AppState {
    /// The state at start: the folders known, and no session yet.
    pub fn new(home: PathBuf, data_dir: PathBuf, bundled: Option<PathBuf>) -> Self {
        let known = std::fs::read_to_string(data_dir.join(KNOWN))
            .ok()
            .and_then(|text| serde_json::from_str::<Vec<String>>(&text).ok())
            .unwrap_or_default()
            .into_iter()
            .map(PathBuf::from)
            .collect();
        Self {
            home,
            data_dir,
            bundled,
            known: Mutex::new(known),
            session: Mutex::new(None),
        }
    }

    /// Where new campaigns go unless told otherwise.
    pub fn campaigns_dir(&self) -> PathBuf {
        self.home.join("campaigns")
    }

    /// The campaign open when the app last closed, if it remembers one.
    pub fn last_open(&self) -> Option<PathBuf> {
        std::fs::read_to_string(self.data_dir.join(CURRENT))
            .ok()
            .map(|text| PathBuf::from(text.trim()))
            .filter(|path| path.is_dir())
    }

    /// Open the campaign in `dir` as the session, with its compendium
    /// installed beside its scenes, and remember it.
    ///
    /// # Errors
    ///
    /// Fails if the folder is not a campaign or its scenes will not open. A
    /// compendium that will not open is reported and the session goes on
    /// without one.
    pub fn open_campaign(&self, dir: &Path) -> Result<CampaignSummary, CampaignError> {
        let campaign = Campaign::open(dir)?;
        let compendium = self.open_compendium(&campaign);
        let summary = campaign.summary();
        if let Ok(mut session) = self.session.lock() {
            *session = Some(Session {
                campaign,
                compendium,
            });
        }
        self.remember(dir);
        Ok(summary)
    }

    /// Back to the intro: no campaign at the table.
    pub fn close_campaign(&self) {
        if let Ok(mut session) = self.session.lock() {
            *session = None;
        }
        if let Err(error) = std::fs::remove_file(self.data_dir.join(CURRENT)) {
            if error.kind() != std::io::ErrorKind::NotFound {
                eprintln!("campaign: could not forget the one open: {error}");
            }
        }
    }

    // The bundle is installed into the campaign, replaced when it is out
    // of date, and once more when it will not open; only then does the
    // session go without a compendium.
    fn open_compendium(&self, campaign: &Campaign) -> Option<Compendium> {
        let bundled = self.bundled.as_ref()?;
        let installed = match compendium::install(bundled, campaign.dir()) {
            Ok(path) => path,
            Err(error) => {
                eprintln!("compendium: not installed: {error} ({})", bundled.display());
                return None;
            }
        };
        match Compendium::open(&installed) {
            Ok(compendium) => return Some(announce(compendium, &installed)),
            Err(error) => eprintln!(
                "compendium: could not open {}: {error}; replacing it from the bundle",
                installed.display()
            ),
        }
        let installed = match compendium::reinstall(bundled, campaign.dir()) {
            Ok(path) => path,
            Err(error) => {
                eprintln!("compendium: not reinstalled: {error}");
                return None;
            }
        };
        match Compendium::open(&installed) {
            Ok(compendium) => Some(announce(compendium, &installed)),
            Err(error) => {
                eprintln!(
                    "compendium: could not open {}: {error}",
                    installed.display()
                );
                None
            }
        }
    }

    // The app's memory is best effort: a campaign it cannot write down is
    // still open, and the intro finds the colocated ones on its own.
    fn remember(&self, dir: &Path) {
        if let Ok(mut known) = self.known.lock() {
            if !known.iter().any(|path| path == dir) {
                known.push(dir.to_path_buf());
            }
            let paths: Vec<String> = known
                .iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            if let Err(error) = std::fs::create_dir_all(&self.data_dir).and_then(|()| {
                let text = serde_json::to_string_pretty(&paths).unwrap_or_default();
                std::fs::write(self.data_dir.join(KNOWN), text)
            }) {
                eprintln!("campaign: could not write the list of campaigns: {error}");
            }
        }
        if let Err(error) = std::fs::write(
            self.data_dir.join(CURRENT),
            dir.to_string_lossy().as_bytes(),
        ) {
            eprintln!("campaign: could not remember the one open: {error}");
        }
    }
}

fn announce(compendium: Compendium, path: &Path) -> Compendium {
    eprintln!(
        "compendium: {} entries from {}",
        compendium.catalogue.len(),
        path.display()
    );
    compendium
}
