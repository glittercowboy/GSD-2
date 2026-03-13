//! Cross-platform process tree management.
//!
//! Provides efficient process tree enumeration and termination without
//! requiring processes to be spawned with `detached: true`.
//!
//! # Platform Implementation
//! - **Linux**: Reads `/proc/{pid}/children` recursively
//! - **macOS**: Uses `libproc` (`proc_listchildpids`)
//! - **Windows**: Uses `CreateToolhelp32Snapshot` to build parent-child
//!   relationships

use napi_derive::napi;

#[cfg(target_os = "linux")]
mod platform {
	use std::fs;

	/// Collect all descendant PIDs of `pid` into `pids`.
	/// Skips branches when `/proc/{pid}/children` cannot be read.
	pub fn collect_descendants(pid: i32, pids: &mut Vec<i32>) {
		let children_path = format!("/proc/{pid}/task/{pid}/children");
		let Ok(content) = fs::read_to_string(&children_path) else {
			return;
		};

		for part in content.split_whitespace() {
			if let Ok(child_pid) = part.parse::<i32>() {
				pids.push(child_pid);
				collect_descendants(child_pid, pids);
			}
		}
	}

	/// Send `signal` to `pid`.
	/// Returns true when the signal is delivered successfully.
	pub fn kill_pid(pid: i32, signal: i32) -> bool {
		// SAFETY: libc::kill is safe to call with any pid/signal combination
		unsafe { libc::kill(pid, signal) == 0 }
	}

	/// Get the process group id for `pid`.
	/// Returns `None` when the process does not exist or is inaccessible.
	pub fn process_group_id(pid: i32) -> Option<i32> {
		// SAFETY: `libc::getpgid` is safe to call with any pid
		let pgid = unsafe { libc::getpgid(pid) };
		if pgid < 0 { None } else { Some(pgid) }
	}

	/// Send `signal` to the process group `pgid`.
	/// Returns true when the signal is delivered successfully.
	pub fn kill_process_group(pgid: i32, signal: i32) -> bool {
		// SAFETY: libc::kill is safe to call with any pid/signal combination
		unsafe { libc::kill(-pgid, signal) == 0 }
	}
}

#[cfg(target_os = "macos")]
mod platform {
	use std::ptr;

	#[link(name = "proc", kind = "dylib")]
	unsafe extern "C" {
		fn proc_listchildpids(ppid: i32, buffer: *mut i32, buffersize: i32) -> i32;
	}

	/// Collect all descendant PIDs of `pid` into `pids` using libproc.
	/// Skips branches when libproc returns no children.
	pub fn collect_descendants(pid: i32, pids: &mut Vec<i32>) {
		// First call to get count
		// SAFETY: passing null buffer with size 0 to query child count is valid per
		// libproc API.
		let count = unsafe { proc_listchildpids(pid, ptr::null_mut(), 0) };
		if count <= 0 {
			return;
		}

		let mut buffer = vec![0i32; count as usize];
		// SAFETY: buffer is correctly sized and aligned for `count` i32 elements.
		let actual = unsafe {
			proc_listchildpids(pid, buffer.as_mut_ptr(), (buffer.len() * size_of::<i32>()) as i32)
		};

		if actual <= 0 {
			return;
		}

		let child_count = actual as usize / size_of::<i32>();
		for &child_pid in &buffer[..child_count] {
			if child_pid > 0 {
				pids.push(child_pid);
				collect_descendants(child_pid, pids);
			}
		}
	}

	/// Send `signal` to `pid`.
	/// Returns true when the signal is delivered successfully.
	pub fn kill_pid(pid: i32, signal: i32) -> bool {
		// SAFETY: libc::kill is safe to call with any pid/signal combination
		unsafe { libc::kill(pid, signal) == 0 }
	}

	/// Get the process group id for `pid`.
	/// Returns `None` when the process does not exist or is inaccessible.
	pub fn process_group_id(pid: i32) -> Option<i32> {
		// SAFETY: libc::getpgid is safe to call with any pid
		let pgid = unsafe { libc::getpgid(pid) };
		if pgid < 0 { None } else { Some(pgid) }
	}

	/// Send `signal` to the process group `pgid`.
	/// Returns true when the signal is delivered successfully.
	pub fn kill_process_group(pgid: i32, signal: i32) -> bool {
		// SAFETY: libc::kill is safe to call with any pid/signal combination
		unsafe { libc::kill(-pgid, signal) == 0 }
	}
}

#[cfg(target_os = "windows")]
mod platform {
	use std::{collections::HashMap, mem};

	#[repr(C)]
	#[allow(non_snake_case, reason = "Windows PROCESSENTRY32W field names must match Win32 ABI")]
	struct PROCESSENTRY32W {
		dwSize:              u32,
		cntUsage:            u32,
		th32ProcessID:       u32,
		th32DefaultHeapID:   usize,
		th32ModuleID:        u32,
		cntThreads:          u32,
		th32ParentProcessID: u32,
		pcPriClassBase:      i32,
		dwFlags:             u32,
		szExeFile:           [u16; 260],
	}

	type Handle = *mut std::ffi::c_void;
	const INVALID_HANDLE_VALUE: Handle = -1isize as Handle;
	const TH32CS_SNAPPROCESS: u32 = 0x00000002;
	const PROCESS_TERMINATE: u32 = 0x0001;

	#[link(name = "kernel32")]
	unsafe extern "system" {
		fn CreateToolhelp32Snapshot(dwFlags: u32, th32ProcessID: u32) -> Handle;
		fn Process32FirstW(hSnapshot: Handle, lppe: *mut PROCESSENTRY32W) -> i32;
		fn Process32NextW(hSnapshot: Handle, lppe: *mut PROCESSENTRY32W) -> i32;
		fn CloseHandle(hObject: Handle) -> i32;
		fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> Handle;
		fn TerminateProcess(hProcess: Handle, uExitCode: u32) -> i32;
	}

	/// Build a map of `parent_pid` -> [`child_pids`] for all processes.
	fn build_process_tree() -> HashMap<u32, Vec<u32>> {
		let mut tree: HashMap<u32, Vec<u32>> = HashMap::new();

		// SAFETY: Toolhelp snapshot APIs are called with initialized structs and valid
		// handles.
		unsafe {
			let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
			if snapshot == INVALID_HANDLE_VALUE {
				return tree;
			}

			let mut entry: PROCESSENTRY32W = mem::zeroed();
			entry.dwSize = mem::size_of::<PROCESSENTRY32W>() as u32;

			if Process32FirstW(snapshot, &raw mut entry) != 0 {
				loop {
					tree
						.entry(entry.th32ParentProcessID)
						.or_default()
						.push(entry.th32ProcessID);

					if Process32NextW(snapshot, &raw mut entry) == 0 {
						break;
					}
				}
			}

			CloseHandle(snapshot);
		}

		tree
	}

	/// Collect all descendant PIDs of `pid` into `pids`.
	/// Uses a snapshot of the current process table.
	pub fn collect_descendants(pid: i32, pids: &mut Vec<i32>) {
		let tree = build_process_tree();
		collect_descendants_from_tree(pid as u32, &tree, pids);
	}

	fn collect_descendants_from_tree(
		pid: u32,
		tree: &HashMap<u32, Vec<u32>>,
		pids: &mut Vec<i32>,
	) {
		if let Some(children) = tree.get(&pid) {
			for &child_pid in children {
				pids.push(child_pid as i32);
				collect_descendants_from_tree(child_pid, tree, pids);
			}
		}
	}

	/// Terminate `pid` (Windows ignores `signal`).
	/// Returns true when the process is terminated.
	pub fn kill_pid(pid: i32, _signal: i32) -> bool {
		// SAFETY: OpenProcess/TerminateProcess are called with kernel-provided process
		// IDs and handles are always closed.
		unsafe {
			let handle = OpenProcess(PROCESS_TERMINATE, 0, pid as u32);
			if handle.is_null() || handle == INVALID_HANDLE_VALUE {
				return false;
			}
			let result = TerminateProcess(handle, 1);
			CloseHandle(handle);
			result != 0
		}
	}

	/// Process groups are not exposed on Windows.
	/// Always returns `None`.
	pub const fn process_group_id(_pid: i32) -> Option<i32> {
		None
	}

	/// Process groups are not exposed on Windows.
	/// Always returns `false`.
	pub const fn kill_process_group(_pgid: i32, _signal: i32) -> bool {
		false
	}
}

/// Kill a process tree (the process and all its descendants).
///
/// Arguments: `pid` is the root process and `signal` is the kill signal.
/// Kills children first (bottom-up) to prevent orphan re-parenting issues.
/// Returns the number of processes successfully killed.
#[napi]
pub fn kill_tree(pid: i32, signal: i32) -> u32 {
	let mut descendants = Vec::new();
	platform::collect_descendants(pid, &mut descendants);

	let mut killed = 0u32;

	// Kill children first (deepest first by reversing the DFS order)
	for &child_pid in descendants.iter().rev() {
		if platform::kill_pid(child_pid, signal) {
			killed += 1;
		}
	}

	// Kill the root process last
	if platform::kill_pid(pid, signal) {
		killed += 1;
	}

	killed
}

/// List all descendant PIDs of `pid`.
///
/// Returns an empty array if the process has no children or doesn't exist.
#[napi]
pub fn list_descendants(pid: i32) -> Vec<i32> {
	let mut descendants = Vec::new();
	platform::collect_descendants(pid, &mut descendants);
	descendants
}

/// Get the process group id for `pid`.
/// Returns `null` when the process is missing or unsupported on the platform.
#[napi]
pub fn process_group_id(pid: i32) -> Option<i32> {
	platform::process_group_id(pid)
}

/// Kill an entire process group.
///
/// Sends `signal` to all processes in the group identified by `pgid`.
/// Returns true when the signal is delivered successfully.
/// Returns false on Windows (process groups not supported).
#[napi]
pub fn kill_process_group(pgid: i32, signal: i32) -> bool {
	platform::kill_process_group(pgid, signal)
}
