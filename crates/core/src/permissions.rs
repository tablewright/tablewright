//! ─ Permissions ─
//!
//! Who sits at the table, what each may do, and how far it reaches.
//! The rules are a file a person writes, `docs/permissions.toml`: the
//! app's own is built into the binary, and a campaign may keep its own
//! beside its scenes, where a role it names replaces the app's whole.
//!
//! The file carries its own vocabulary. Every permission the app knows
//! is listed under `[features]`, grouped by the thing it acts on, so
//! one block says everything that thing can have. A role may name
//! nothing else, and the app may check nothing the file does not list:
//! the two are compared here, so neither can drift into fiction.
//!
//! Design: docs/permissions.md

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use crate::compendium::Visibility;

/// The app's own rules, read at build time so they are never missing.
const APP: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../docs/permissions.toml"
));

/// What a campaign's own rules are called, beside its scenes.
pub const FILE: &str = "permissions.toml";

/// One thing a hand may do: the thing it acts on, then what is done.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Type)]
pub enum Permission {
    #[serde(rename = "ink:ground:draw")]
    InkGroundDraw,
    #[serde(rename = "ink:wall:draw")]
    InkWallDraw,
    #[serde(rename = "ink:threshold:draw")]
    InkThresholdDraw,
    #[serde(rename = "ink:threshold:open")]
    InkThresholdOpen,
    #[serde(rename = "ink:height:draw")]
    InkHeightDraw,
    #[serde(rename = "ink:level-change:draw")]
    InkLevelChangeDraw,
    #[serde(rename = "ink:free:draw")]
    InkFreeDraw,
    #[serde(rename = "history:read")]
    HistoryRead,
    #[serde(rename = "history:undo")]
    HistoryUndo,
    #[serde(rename = "history:clear")]
    HistoryClear,
    #[serde(rename = "scene:change")]
    SceneChange,
    #[serde(rename = "scene:map:set")]
    SceneMapSet,
    #[serde(rename = "token:place")]
    TokenPlace,
    #[serde(rename = "token:move")]
    TokenMove,
    #[serde(rename = "topology:read")]
    TopologyRead,
    #[serde(rename = "ruler:use")]
    RulerUse,
    #[serde(rename = "ruler:show")]
    RulerShow,
    #[serde(rename = "compendium:read")]
    CompendiumRead,
}

impl Permission {
    /// Every permission the app checks, in the order the file lists them.
    pub const ALL: [Self; 18] = [
        Self::InkGroundDraw,
        Self::InkWallDraw,
        Self::InkThresholdDraw,
        Self::InkThresholdOpen,
        Self::InkHeightDraw,
        Self::InkLevelChangeDraw,
        Self::InkFreeDraw,
        Self::HistoryRead,
        Self::HistoryUndo,
        Self::HistoryClear,
        Self::SceneChange,
        Self::SceneMapSet,
        Self::TokenPlace,
        Self::TokenMove,
        Self::TopologyRead,
        Self::RulerUse,
        Self::RulerShow,
        Self::CompendiumRead,
    ];

    /// The name the file calls it, `thing:what`.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::InkGroundDraw => "ink:ground:draw",
            Self::InkWallDraw => "ink:wall:draw",
            Self::InkThresholdDraw => "ink:threshold:draw",
            Self::InkThresholdOpen => "ink:threshold:open",
            Self::InkHeightDraw => "ink:height:draw",
            Self::InkLevelChangeDraw => "ink:level-change:draw",
            Self::InkFreeDraw => "ink:free:draw",
            Self::HistoryRead => "history:read",
            Self::HistoryUndo => "history:undo",
            Self::HistoryClear => "history:clear",
            Self::SceneChange => "scene:change",
            Self::SceneMapSet => "scene:map:set",
            Self::TokenPlace => "token:place",
            Self::TokenMove => "token:move",
            Self::TopologyRead => "topology:read",
            Self::RulerUse => "ruler:use",
            Self::RulerShow => "ruler:show",
            Self::CompendiumRead => "compendium:read",
        }
    }
}

/// A named set of permissions. A person holds one at a time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct Role {
    /// What the role is called on screen.
    pub name: String,
    /// How far sight goes: everything marked at this or below.
    pub sees: Visibility,
    /// What may be done. A name the app does not know is an error.
    pub permissions: Vec<Permission>,
    /// Where a permission reaches past one's own, which is the default.
    #[serde(default)]
    pub reach: BTreeMap<Permission, Visibility>,
}

impl Role {
    /// Whether this role may do `permission` at all.
    #[must_use]
    pub fn allows(&self, permission: Permission) -> bool {
        self.permissions.contains(&permission)
    }

    /// How far it carries: one's own unless the file says wider.
    #[must_use]
    pub fn reach_of(&self, permission: Permission) -> Visibility {
        self.reach
            .get(&permission)
            .copied()
            .unwrap_or(Visibility::Own)
    }
}

/// What a feature holds: something done to it, or things under it.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
enum Feature {
    /// A leaf: what is done, and what that means in a line.
    Does(String),
    /// A branch: the things under it, each with their own.
    Holds(BTreeMap<String, Feature>),
}

impl Feature {
    // Every path to a leaf, joined as the file names it.
    fn paths(&self, at: &str, into: &mut BTreeSet<String>) {
        match self {
            Self::Does(_) => {
                into.insert(at.to_owned());
            }
            Self::Holds(under) => {
                for (name, feature) in under {
                    feature.paths(&format!("{at}:{name}"), into);
                }
            }
        }
    }
}

/// The rules as one file holds them.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Permissions {
    /// The whole vocabulary. A campaign leaves this to the app.
    #[serde(default)]
    features: BTreeMap<String, Feature>,
    /// The roles, by the name a person is given.
    #[serde(default)]
    pub roles: BTreeMap<String, Role>,
}

impl Permissions {
    /// The app's own rules. Built in, so they are never missing.
    ///
    /// # Panics
    ///
    /// When the built-in file is wrong, which is a fault in the app and
    /// not in anybody's table. A test holds it to that.
    #[must_use]
    pub fn app() -> Self {
        let path = Path::new("docs/permissions.toml");
        Self::parse(APP, path).expect("the app's own permissions")
    }

    /// A campaign's own rules, if it keeps any.
    ///
    /// # Errors
    ///
    /// `Io` when the file will not read, `Toml` when it will not parse,
    /// `Invalid` when it says something the app cannot honour.
    pub fn load(path: &Path) -> Result<Self, PermissionsError> {
        let text = std::fs::read_to_string(path).map_err(|source| PermissionsError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        let rules = Self::parse(&text, path)?;
        if !rules.features.is_empty() {
            return Err(PermissionsError::Invalid {
                path: path.to_path_buf(),
                reason: "a campaign says who may do what, not what may be done: \
                         leave [features] to the app"
                    .to_owned(),
            });
        }
        Ok(rules)
    }

    /// This campaign's rules over the app's own: a role it names
    /// replaces the app's whole, and the vocabulary stays the app's.
    #[must_use]
    pub fn under(mut self, campaign: Self) -> Self {
        for (id, role) in campaign.roles {
            self.roles.insert(id, role);
        }
        self
    }

    /// The role by the name a person is given.
    #[must_use]
    pub fn of(&self, role: &str) -> Option<&Role> {
        self.roles.get(role)
    }

    fn parse(text: &str, path: &Path) -> Result<Self, PermissionsError> {
        let rules: Self = toml::from_str(text).map_err(|source| PermissionsError::Toml {
            path: path.to_path_buf(),
            source,
        })?;
        rules.check(path)?;
        Ok(rules)
    }

    // What the file says has to be what the app can do, both ways
    // round: a permission the app checks and the file leaves out is a
    // rule nobody can grant, and one the file lists and the app never
    // checks is a rule that does nothing.
    fn check(&self, path: &Path) -> Result<(), PermissionsError> {
        let refuse = |reason: String| PermissionsError::Invalid {
            path: path.to_path_buf(),
            reason,
        };
        if !self.features.is_empty() {
            let mut listed = BTreeSet::new();
            for (name, feature) in &self.features {
                feature.paths(name, &mut listed);
            }
            let known: BTreeSet<String> = Permission::ALL
                .iter()
                .map(|one| one.name().to_owned())
                .collect();
            if let Some(extra) = listed.difference(&known).next() {
                return Err(refuse(format!(
                    "[features] lists {extra}, which nothing in the app checks"
                )));
            }
            if let Some(missing) = known.difference(&listed).next() {
                return Err(refuse(format!(
                    "[features] leaves out {missing}, which the app checks"
                )));
            }
        }
        for (id, role) in &self.roles {
            for permission in role.reach.keys() {
                if !role.allows(*permission) {
                    return Err(refuse(format!(
                        "{id} reaches further with {}, which it may not do at all",
                        permission.name()
                    )));
                }
            }
        }
        Ok(())
    }
}

/// What went wrong with a permissions file.
#[derive(Debug, thiserror::Error)]
pub enum PermissionsError {
    #[error("{path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("{path}: {source}")]
    Toml {
        path: PathBuf,
        #[source]
        source: toml::de::Error,
    },
    #[error("{path}: {reason}")]
    Invalid { path: PathBuf, reason: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    // The tests run beside each other, so each writes its own file.
    static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

    fn campaign(text: &str) -> Result<Permissions, PermissionsError> {
        let one = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("tw-permissions-{}-{one}.toml", std::process::id()));
        std::fs::write(&path, text).expect("write");
        let read = Permissions::load(&path);
        std::fs::remove_file(&path).ok();
        read
    }

    #[test]
    fn the_app_s_own_rules_load_and_name_every_permission_the_app_checks() {
        let rules = Permissions::app();
        assert_eq!(rules.roles.len(), 3, "the DM, a player and a spectator");
        let dm = rules.of("dm").expect("the dm role");
        assert!(dm.allows(Permission::InkWallDraw));
        assert_eq!(dm.sees, Visibility::Dm);
    }

    #[test]
    fn a_player_draws_freely_and_a_spectator_measures_for_themselves() {
        let rules = Permissions::app();
        let player = rules.of("player").expect("the player role");
        assert!(
            player.allows(Permission::InkFreeDraw),
            "the memes are the table's"
        );
        assert!(
            !player.allows(Permission::InkWallDraw),
            "the walls are the DM's"
        );
        let spectator = rules.of("spectator").expect("the spectator role");
        assert!(spectator.allows(Permission::RulerUse));
        assert!(
            !spectator.allows(Permission::RulerShow),
            "it reaches nobody"
        );
    }

    #[test]
    fn what_is_made_is_ones_own_until_the_file_says_wider() {
        let rules = Permissions::app();
        let player = rules.of("player").expect("the player role");
        assert_eq!(player.reach_of(Permission::TokenMove), Visibility::Own);
        let dm = rules.of("dm").expect("the dm role");
        assert_eq!(dm.reach_of(Permission::TokenMove), Visibility::World);
    }

    #[test]
    fn a_campaign_replaces_a_role_whole() {
        let own = campaign(
            r#"
            [roles.player]
            name = "Player"
            sees = "party"
            permissions = ["ruler:use"]
            "#,
        )
        .expect("a campaign's own");
        let rules = Permissions::app().under(own);
        let player = rules.of("player").expect("the player role");
        assert!(player.allows(Permission::RulerUse));
        assert!(
            !player.allows(Permission::TokenMove),
            "written out, so gone"
        );
        assert!(rules.of("dm").is_some(), "the roles it does not name stand");
    }

    #[test]
    fn a_name_the_app_does_not_know_is_refused_with_the_line() {
        let error = campaign(
            r#"
            [roles.player]
            name = "Player"
            sees = "party"
            permissions = ["ruler:used"]
            "#,
        )
        .expect_err("a misspelt permission");
        assert!(matches!(error, PermissionsError::Toml { .. }), "{error}");
        let said = error.to_string();
        assert!(said.contains("ruler:used"), "{said}");
        assert!(said.contains("line"), "{said}");
    }

    #[test]
    fn a_reach_on_something_the_role_may_not_do_is_refused() {
        let error = campaign(
            r#"
            [roles.player]
            name = "Player"
            sees = "party"
            permissions = ["ruler:use"]
            reach = { "token:move" = "world" }
            "#,
        )
        .expect_err("a reach with nothing to reach with");
        assert!(error.to_string().contains("token:move"), "{error}");
    }

    #[test]
    fn a_campaign_may_not_invent_what_may_be_done() {
        let error = campaign(
            r#"
            [features.dragon]
            summon = "Whistle for it."

            [roles.player]
            name = "Player"
            sees = "party"
            permissions = ["ruler:use"]
            "#,
        )
        .expect_err("a campaign's own vocabulary");
        assert!(error.to_string().contains("[features]"), "{error}");
    }

    #[test]
    fn an_unknown_key_is_refused_rather_than_passed_over() {
        let error = campaign(
            r#"
            [roles.player]
            name = "Player"
            sees = "party"
            permissions = ["ruler:use"]
            reaches = { "token:move" = "world" }
            "#,
        )
        .expect_err("a key that is nearly right");
        let said = error.to_string();
        assert!(said.contains("reaches"), "{said}");
        assert!(said.contains("reach"), "{said}");
    }
}
