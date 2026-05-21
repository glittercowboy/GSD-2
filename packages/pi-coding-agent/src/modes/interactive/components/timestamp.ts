// Project/App: GSD-2
// File Purpose: Timestamp formatting helpers for interactive transcript messages.

/**
 * Timestamp formatting for message display.
 *
 * Supported formats:
 * - "date-time-iso":  2025-03-24 10:34    (default)
 * - "date-time-us":   03-24-2025 10:34 AM
 */

export type TimestampFormat = "date-time-iso" | "date-time-us";

function pad2(n: number): string {
	return n.toString().padStart(2, "0");
}

function isoDate(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoTime(d: Date): string {
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function usDate(d: Date): string {
	return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}`;
}

function usTime(d: Date): string {
	const hours = d.getHours();
	const period = hours >= 12 ? "PM" : "AM";
	const h = hours % 12 || 12;
	return `${h}:${pad2(d.getMinutes())} ${period}`;
}

/**
 * Format a timestamp for message display using the specified format.
 */
export function formatTimestamp(timestamp: number, format: TimestampFormat = "date-time-iso"): string {
	const d = new Date(timestamp);

	switch (format) {
		case "date-time-iso":
			return `${isoDate(d)} ${isoTime(d)}`;
		case "date-time-us":
			return `${usDate(d)} ${usTime(d)}`;
	}
}
