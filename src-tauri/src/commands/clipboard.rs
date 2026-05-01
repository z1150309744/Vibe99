#[cfg(target_os = "macos")]
fn read_file_paths_macos() -> Vec<String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeFileURL};
    use objc2_foundation::NSURL;

    let pb = NSPasteboard::generalPasteboard();
    let items = match pb.pasteboardItems() {
        Some(items) => items,
        None => return vec![],
    };

    let mut paths = Vec::new();
    for item in items.iter() {
        let url_str = item.stringForType(unsafe { NSPasteboardTypeFileURL });
        if let Some(url_str) = url_str {
            let url = NSURL::URLWithString(&url_str);
            if let Some(url) = url {
                if let Some(path) = url.path() {
                    paths.push(path.to_string());
                }
            }
        }
    }
    paths
}

#[tauri::command]
pub fn clipboard_read_file_paths() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(read_file_paths_macos))
            .unwrap_or_default()
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![]
    }
}
