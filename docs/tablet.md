# Hub and tablet

## Run it

```
cd C:\TruckingServer\hub
npm install
npm start
```

Then open http://localhost:7420/tablet/ in a browser. Later this same page becomes the in-game overlay.

## Customise the tablet

Everything visual is in `tablet/`, and changes show after a browser refresh.

| What | Where |
| --- | --- |
| Your name, brand text, colours, wallpaper, corner radius, font | `tablet/config.json` (`brand`, `theme`) |
| Which apps appear, their order, labels and icon colours | `tablet/config.json` (`apps`) |
| Device frame, home screen and shared styles | `tablet/tablet.css` |
| How one app looks and works | `tablet/apps/<id>.js` |

To add an app, create `tablet/apps/myapp.js` exporting `{ icon, mount(root, ctx) }` and add `{ "id": "myapp", "label": "My App", "tint": "#hex" }` to `apps`.
`mount` gets `ctx.hub` (`hub.on(type, fn)`, `hub.send(msg)`) and `ctx.config`, and can return a cleanup function.

## Simulated players

`hub/data/settings.json` controls the simulation: number of bots, CB range and nearby range.
Until real telemetry is connected, your own truck is simulated too (the status bar says "simulated").
Bots chat every so often, use CB channel 19, and answer when you transmit while one is in range.

## News

Edit `hub/data/news.json`. The tablet's News app reads it on open.
