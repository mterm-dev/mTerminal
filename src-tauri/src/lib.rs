mod hosts;
mod pty;
mod ssh;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_info,
            pty::system_info,
            vault::vault_status,
            vault::vault_init,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_change_password,
            hosts::host_list,
            hosts::host_save,
            hosts::host_delete,
            hosts::host_get_password,
            hosts::host_group_save,
            hosts::host_group_delete,
            hosts::host_set_group,
            hosts::list_ssh_keys,
            hosts::tool_availability,
            ssh::ssh_spawn,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
