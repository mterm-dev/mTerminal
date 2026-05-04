mod ai;
mod claude_code;
mod hosts;
mod mcp_server;
mod pty;
mod ssh;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_info,
            pty::pty_recent_output,
            pty::system_info,
            claude_code::claude_code_status,
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
            ai::ai_stream_complete,
            ai::ai_cancel,
            ai::ai_list_models,
            ai::ai_set_key,
            ai::ai_clear_key,
            ai::ai_has_key,
            mcp_server::mcp_server_status,
            mcp_server::mcp_server_start,
            mcp_server::mcp_server_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
