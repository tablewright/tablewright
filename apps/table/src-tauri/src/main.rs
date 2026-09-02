// Release builds must not open a console window alongside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    table_lib::run();
}
