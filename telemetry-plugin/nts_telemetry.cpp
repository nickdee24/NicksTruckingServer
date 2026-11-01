// NTS telemetry plugin for Euro Truck Simulator 2.
// Built on the official SCS Telemetry SDK. Sends the truck's position, speed and job
// to the hub as small JSON packets over UDP, about four times a second.
//
// Settings are read from nts_telemetry.ini next to the DLL:
//   name=Nick
//   host=127.0.0.1
//   port=7421

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "scssdk_telemetry.h"
#include "eurotrucks2/scssdk_eut2.h"
#include "eurotrucks2/scssdk_telemetry_eut2.h"
#include "common/scssdk_telemetry_common_configs.h"
#include "common/scssdk_telemetry_truck_common_channels.h"

#define UNUSED(x)

static const DWORD SEND_INTERVAL_MS = 250;

static SOCKET sock = INVALID_SOCKET;
static sockaddr_in hub_addr = {};
static char player_name[64] = "Driver";
static scs_log_t game_log = NULL;

static struct {
	scs_value_dplacement_t placement;
	float speed;
	float fuel;
	bool paused;
	char truck[96];
	char cargo[96];
	char source_city[64];
	char destination_city[64];
	DWORD last_send;
} state = {};

// Keeps strings safe to drop into JSON.
static void copy_clean(char *dst, size_t size, const char *src)
{
	size_t n = 0;
	for (; src && *src && n + 1 < size; ++src) {
		if (*src != '"' && *src != '\\' && (unsigned char)*src >= 0x20) dst[n++] = *src;
	}
	dst[n] = '\0';
}

static void load_settings(void)
{
	char path[MAX_PATH] = {};
	HMODULE self = NULL;
	GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
		(LPCSTR)&load_settings, &self);
	GetModuleFileNameA(self, path, MAX_PATH);
	char *slash = strrchr(path, '\\');
	if (slash) strcpy_s(slash + 1, MAX_PATH - (slash + 1 - path), "nts_telemetry.ini");

	char host[64] = "127.0.0.1";
	int port = 7421;
	FILE *f = NULL;
	if (fopen_s(&f, path, "rt") == 0 && f) {
		char line[128];
		while (fgets(line, sizeof line, f)) {
			line[strcspn(line, "\r\n")] = '\0';
			if (strncmp(line, "name=", 5) == 0) copy_clean(player_name, sizeof player_name, line + 5);
			else if (strncmp(line, "host=", 5) == 0) copy_clean(host, sizeof host, line + 5);
			else if (strncmp(line, "port=", 5) == 0) port = atoi(line + 5);
		}
		fclose(f);
	}

	hub_addr.sin_family = AF_INET;
	hub_addr.sin_port = htons((u_short)port);
	inet_pton(AF_INET, host, &hub_addr.sin_addr);
}

static void send_state(void)
{
	char buf[640];
	// SCS heading is a fraction of a turn, counter-clockwise from north. Convert to radians clockwise.
	const double heading = -state.placement.orientation.heading * 6.283185307179586;
	const int len = _snprintf_s(buf, sizeof buf, _TRUNCATE,
		"{\"type\":\"telemetry\",\"name\":\"%s\",\"x\":%.1f,\"y\":%.1f,\"z\":%.1f,\"heading\":%.4f,"
		"\"speedKmh\":%.1f,\"fuel\":%.1f,\"paused\":%s,\"truck\":\"%s\",\"cargo\":\"%s\",\"from\":\"%s\",\"to\":\"%s\"}",
		player_name, state.placement.position.x, state.placement.position.y, state.placement.position.z, heading,
		state.speed * 3.6f, state.fuel, state.paused ? "true" : "false", state.truck, state.cargo,
		state.source_city, state.destination_city);
	if (len > 0) sendto(sock, buf, len, 0, (const sockaddr *)&hub_addr, sizeof hub_addr);
}

static const scs_named_value_t *find_attr(const scs_telemetry_configuration_t *info, const char *name)
{
	for (const scs_named_value_t *a = info->attributes; a->name; ++a) {
		if (strcmp(a->name, name) == 0) return a;
	}
	return NULL;
}

static void copy_attr_string(const scs_telemetry_configuration_t *info, const char *name, char *dst, size_t size)
{
	const scs_named_value_t *a = find_attr(info, name);
	copy_clean(dst, size, (a && a->value.type == SCS_VALUE_TYPE_string) ? a->value.value_string.value : "");
}

SCSAPI_VOID on_frame_end(const scs_event_t UNUSED(event), const void *const UNUSED(info), const scs_context_t UNUSED(ctx))
{
	const DWORD now = GetTickCount();
	if (now - state.last_send < SEND_INTERVAL_MS) return;
	state.last_send = now;
	send_state();
}

SCSAPI_VOID on_pause(const scs_event_t event, const void *const UNUSED(info), const scs_context_t UNUSED(ctx))
{
	state.paused = (event == SCS_TELEMETRY_EVENT_paused);
	send_state();
}

SCSAPI_VOID on_configuration(const scs_event_t UNUSED(event), const void *const event_info, const scs_context_t UNUSED(ctx))
{
	const scs_telemetry_configuration_t *info = static_cast<const scs_telemetry_configuration_t *>(event_info);
	if (strcmp(info->id, SCS_TELEMETRY_CONFIG_truck) == 0) {
		char brand[48], name[48];
		copy_attr_string(info, SCS_TELEMETRY_CONFIG_ATTRIBUTE_brand, brand, sizeof brand);
		copy_attr_string(info, SCS_TELEMETRY_CONFIG_ATTRIBUTE_name, name, sizeof name);
		_snprintf_s(state.truck, sizeof state.truck, _TRUNCATE, "%s %s", brand, name);
	}
	else if (strcmp(info->id, SCS_TELEMETRY_CONFIG_job) == 0) {
		copy_attr_string(info, SCS_TELEMETRY_CONFIG_ATTRIBUTE_cargo, state.cargo, sizeof state.cargo);
		copy_attr_string(info, SCS_TELEMETRY_CONFIG_ATTRIBUTE_source_city, state.source_city, sizeof state.source_city);
		copy_attr_string(info, SCS_TELEMETRY_CONFIG_ATTRIBUTE_destination_city, state.destination_city, sizeof state.destination_city);
	}
}

// Job delivered or cancelled: tells the hub where the truck was, so it can learn company depots.
SCSAPI_VOID on_gameplay(const scs_event_t UNUSED(event), const void *const event_info, const scs_context_t UNUSED(ctx))
{
	const scs_telemetry_gameplay_event_t *info = static_cast<const scs_telemetry_gameplay_event_t *>(event_info);
	char id[48];
	copy_clean(id, sizeof id, info->id);
	char buf[256];
	const int len = _snprintf_s(buf, sizeof buf, _TRUNCATE,
		"{\"type\":\"gameplay\",\"name\":\"%s\",\"event\":\"%s\",\"x\":%.1f,\"z\":%.1f}",
		player_name, id, state.placement.position.x, state.placement.position.z);
	if (len > 0) sendto(sock, buf, len, 0, (const sockaddr *)&hub_addr, sizeof hub_addr);
}

SCSAPI_VOID store_fuel(const scs_string_t UNUSED(name), const scs_u32_t UNUSED(index), const scs_value_t *const value, const scs_context_t UNUSED(ctx))
{
	state.fuel = value ? value->value_float.value : 0.0f;
}

SCSAPI_VOID store_placement(const scs_string_t UNUSED(name), const scs_u32_t UNUSED(index), const scs_value_t *const value, const scs_context_t UNUSED(ctx))
{
	if (value) state.placement = value->value_dplacement;
}

SCSAPI_VOID store_speed(const scs_string_t UNUSED(name), const scs_u32_t UNUSED(index), const scs_value_t *const value, const scs_context_t UNUSED(ctx))
{
	state.speed = value ? value->value_float.value : 0.0f;
}

SCSAPI_RESULT scs_telemetry_init(const scs_u32_t version, const scs_telemetry_init_params_t *const params)
{
	if (version != SCS_TELEMETRY_VERSION_1_00) return SCS_RESULT_unsupported;
	const scs_telemetry_init_params_v100_t *const p = static_cast<const scs_telemetry_init_params_v100_t *>(params);
	game_log = p->common.log;

	WSADATA wsa;
	if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return SCS_RESULT_generic_error;
	sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
	if (sock == INVALID_SOCKET) { WSACleanup(); return SCS_RESULT_generic_error; }
	load_settings();

	memset(&state, 0, sizeof state);
	state.paused = true;

	const bool ok =
		p->register_for_event(SCS_TELEMETRY_EVENT_frame_end, on_frame_end, NULL) == SCS_RESULT_ok &&
		p->register_for_event(SCS_TELEMETRY_EVENT_paused, on_pause, NULL) == SCS_RESULT_ok &&
		p->register_for_event(SCS_TELEMETRY_EVENT_started, on_pause, NULL) == SCS_RESULT_ok &&
		p->register_for_event(SCS_TELEMETRY_EVENT_configuration, on_configuration, NULL) == SCS_RESULT_ok;
	// Gameplay events arrived in a later SDK; older games simply skip them.
	p->register_for_event(SCS_TELEMETRY_EVENT_gameplay, on_gameplay, NULL);
	if (!ok) {
		closesocket(sock);
		WSACleanup();
		return SCS_RESULT_generic_error;
	}

	p->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_world_placement, SCS_U32_NIL, SCS_VALUE_TYPE_dplacement, SCS_TELEMETRY_CHANNEL_FLAG_none, store_placement, NULL);
	p->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_speed, SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, store_speed, NULL);
	p->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_fuel, SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, store_fuel, NULL);

	game_log(SCS_LOG_TYPE_message, "[nts] telemetry plugin ready");
	return SCS_RESULT_ok;
}

SCSAPI_VOID scs_telemetry_shutdown(void)
{
	if (sock != INVALID_SOCKET) {
		closesocket(sock);
		sock = INVALID_SOCKET;
		WSACleanup();
	}
	game_log = NULL;
}

BOOL APIENTRY DllMain(HMODULE UNUSED(module), DWORD reason, LPVOID UNUSED(reserved))
{
	if (reason == DLL_PROCESS_DETACH && sock != INVALID_SOCKET) {
		closesocket(sock);
	}
	return TRUE;
}
