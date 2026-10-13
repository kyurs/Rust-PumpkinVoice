# Pumpkin Voice — proximity voice setup

Adapted from [PumpkinVoice](https://github.com/hmdnnrmn/PumpkinVoice), commit `b9c7d321e07771ab66115894133f34954d508101`, by hmdnnrmn under GPL-3.0. Original attribution and license are retained. Changes include the pinned SDK, proximity-only deployment profile, its regression test, and integration probe.

Pumpkin SDK: `204a94ed895f041a845630d5a23c094705a0704e`. Use a compatible Pumpkin host; its plugin ABI is version-sensitive. `Cargo.lock` pins dependencies.

## Build

```sh
git clone https://github.com/kyurs/Rust-PumpkinVoice.git
cd Rust-PumpkinVoice
rustup target add wasm32-wasip2
cargo test --locked --target "$(rustc -vV | sed -n 's/^host: //p')"
cargo build --locked --release --target wasm32-wasip2
```

Output: `target/wasm32-wasip2/release/pumpkin_voice.wasm`, also available in Releases.

## Install

Back up existing plugin data and stop Pumpkin gracefully. Install the WASM as `plugins/pumpkin_voice.wasm`. For the proximity-only profile, copy `deploy/config.toml` into `plugins/data/pumpkin_voice/config.toml`. Do not overwrite an existing configuration without a backup. Add to `pumpkin.toml`:

```toml
[plugins.overrides.pumpkin_voice]
enabled = true
allow_unsigned = true
max_memory_mb = 64
allowed_permissions = ["fs.read.data", "fs.write.data", "network.udp.bind", "network.udp.connect", "network.udp.outgoingdatagram", "network.outbound"]
```

Allow inbound **UDP 24454** in host and provider firewalls, then start Pumpkin. The default empty `voice_host` uses the game hostname. Behind a proxy or NAT, set it to the publicly reachable voice hostname and port, for example `voice.example.com:24454`. HTTP/WebSocket proxies do not forward this UDP traffic.

The supplied profile provides a 48-block speaking range and 24-block whisper range. Groups and in-client recording are disabled; unmodded clients are allowed. External recording cannot be prevented. Rate limits are 100 UDP packets/player/second and 16 TCP plugin messages/player/second. The complete configuration is validated; invalid files are preserved and rejected.

To remove the plugin, stop Pumpkin, move the WASM out of `plugins/`, and restart. Retain its data if you plan to reinstall.

## Players and testing

Install Simple Voice Chat **2.6.x**, protocol compatibility 20, for your Minecraft version and Fabric/Forge/NeoForge loader. Join your server, press **V**, and configure microphone and push-to-talk. `/voicechat status` reports connection state. Vanilla and Eaglercraft clients do not gain voice support from this server plugin.

Pure-Rust tests cover protocol and routing behavior. The optional integration probe uses two synthetic Java clients and Opus silence, not a microphone. Install `minecraft-protocol` in a separate test tooling directory, then:

```sh
PROBE_HOST=your-test-server NODE_PATH=/path/to/test-tools/node_modules node tests/live-probe.cjs
```

Use an authorized test server. Real microphone quality, audible distance fading and the client UI require a two-player modded-client test. Voice encryption does not authenticate offline-mode Minecraft accounts.
