//! What the shell holds for the lifetime of the app: where campaigns and
//! the library live, which campaigns are known, and the session open, a
//! campaign with its shelf. The session is opened from the intro screen
//! and closed back to it; every command that needs a campaign asks for the
//! session and says so when there is none.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tablewright_core::{Campaign, CampaignError, CampaignSummary, Shelf, Store, StoreError};

use crate::compendium;

// The app's own memory: the campaigns it knows, and the one open.
const KNOWN: &str = "campaigns.json";
const CURRENT: &str = "campaign";

/// A campaign at the table, with its shelf when a store could be opened.
pub struct Session {
    pub campaign: Campaign,
    pub shelf: Option<Shelf>,
}

/// The managed state.
pub struct AppState {
    /// The Tablewright home: campaigns go under `campaigns/` unless the DM
    /// puts one elsewhere, and the library every campaign shares is under
    /// `library/`.
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

    /// Where the library lives: the bundled SRD installed from the app,
    /// and later the modules the DM installs.
    pub fn library_dir(&self) -> PathBuf {
        self.home.join("library")
    }

    /// The library's store, installed from the bundle when it is missing
    /// or older. `None` when there is no bundle or it cannot be copied.
    pub fn library(&self) -> Option<PathBuf> {
        let bundled = self.bundled.as_ref()?;
        match compendium::install(bundled, &self.library_dir()) {
            Ok(path) => Some(path),
            Err(error) => {
                eprintln!("library: not installed: {error} ({})", bundled.display());
                None
            }
        }
    }

    /// Every module the library holds, by id: what a new campaign lists,
    /// until choosing modules at creation comes (design §3). Empty when
    /// there is no library.
    ///
    /// # Errors
    ///
    /// Fails if the library is there but cannot be read.
    pub fn library_modules(&self) -> Result<Vec<String>, StoreError> {
        let Some(path) = self.library() else {
            return Ok(Vec::new());
        };
        let store = Store::open(&path)?;
        Ok(store
            .modules()?
            .into_iter()
            .map(|manifest| manifest.id)
            .collect())
    }

    /// The campaign open when the app last closed, if it remembers one.
    pub fn last_open(&self) -> Option<PathBuf> {
        std::fs::read_to_string(self.data_dir.join(CURRENT))
            .ok()
            .map(|text| PathBuf::from(text.trim()))
            .filter(|path| path.is_dir())
    }

    /// Open the campaign in `dir` as the session, with its shelf over the
    /// library and its own store, and remember it.
    ///
    /// # Errors
    ///
    /// Fails if the folder is not a campaign or its scenes will not open. A
    /// shelf that will not open is reported and the session goes on
    /// without one.
    pub fn open_campaign(&self, dir: &Path) -> Result<CampaignSummary, CampaignError> {
        let campaign = Campaign::open(dir)?;
        let shelf = self.open_shelf(&campaign);
        let summary = campaign.summary();
        if let Ok(mut session) = self.session.lock() {
            *session = Some(Session { campaign, shelf });
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

    // The shelf is the library, showing the modules the campaign lists,
    // under the campaign's own store when it has one. A library that will
    // not open is replaced from the bundle once; only then does the session
    // go without a shelf.
    fn open_shelf(&self, campaign: &Campaign) -> Option<Shelf> {
        let own = campaign.compendium_path();
        let modules = &campaign.manifest().modules;
        let library = self.library();
        if own.is_none() && library.is_none() {
            eprintln!("compendium: no library and no store of the campaign's own");
            return None;
        }
        match Shelf::open(library.as_deref(), own.as_deref(), modules) {
            Ok(shelf) => return Some(announce(shelf, campaign)),
            Err(error) => eprintln!("compendium: could not open: {error}; replacing the library"),
        }
        let bundled = self.bundled.as_ref()?;
        let library = match compendium::reinstall(bundled, &self.library_dir()) {
            Ok(path) => Some(path),
            Err(error) => {
                eprintln!("library: not reinstalled: {error}");
                None
            }
        };
        match Shelf::open(library.as_deref(), own.as_deref(), modules) {
            Ok(shelf) => Some(announce(shelf, campaign)),
            Err(error) => {
                eprintln!("compendium: could not open: {error}");
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

fn announce(shelf: Shelf, campaign: &Campaign) -> Shelf {
    eprintln!(
        "compendium: {} entries on the shelf for {} ({})",
        shelf.len(),
        campaign.manifest().name,
        campaign.manifest().modules.join(", ")
    );
    shelf
}
