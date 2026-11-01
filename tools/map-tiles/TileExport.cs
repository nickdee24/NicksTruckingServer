// Renders an ETS2 map background as web map tiles, from your own game files, using ts-map
// (https://github.com/dariowouters/ts-map, MIT). Roads are drawn dark grey; the live map
// draws the roads you've driven over them in orange.
//
//   TileExport.exe <game folder> <output folder> [maxZoom]   (maxZoom -1 exports only Cities.json)
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using TsMap;

class DarkPalette : MapPalette
{
    public DarkPalette()
    {
        Background = new SolidBrush(Color.FromArgb(35, 39, 46));      // #23272e, the map page background
        Road = new SolidBrush(Color.FromArgb(70, 76, 87));            // dark grey: not driven yet
        PrefabRoad = Road;
        PrefabLight = new SolidBrush(Color.FromArgb(48, 53, 61));     // depots, junction areas
        PrefabDark = new SolidBrush(Color.FromArgb(56, 61, 70));
        PrefabGreen = new SolidBrush(Color.FromArgb(44, 52, 47));
        CityName = new SolidBrush(Color.FromArgb(201, 209, 217));
        FerryLines = new SolidBrush(Color.FromArgb(70, 120, 140, 160));
        Error = Brushes.IndianRed;
    }
}

static class TileExport
{
    const int TileSize = 256;
    const int MapPadding = 500;

    static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.WriteLine("Usage: TileExport <game folder> <output folder> [maxZoom]");
            return 1;
        }
        var gameDir = args[0];
        var outDir = args[1];
        var maxZoom = args.Length > 2 ? int.Parse(args[2]) : 7;

        Console.WriteLine("Reading game files…");
        var mapper = new TsMapper(gameDir, new List<Mod>());
        mapper.Parse();
        var renderer = new TsMapRenderer(mapper);
        var palette = new DarkPalette();
        var flags = (RenderFlags.Roads | RenderFlags.Prefabs | RenderFlags.FerryConnections | RenderFlags.MapAreas);

        // Same framing as ts-map's own exporter: the whole map, square, with padding.
        var mapWidth = mapper.maxX - mapper.minX + MapPadding * 2;
        var mapHeight = mapper.maxZ - mapper.minZ + MapPadding * 2;
        var size = Math.Max(mapWidth, mapHeight);
        var x1 = mapper.minX - MapPadding - (size - mapWidth) / 2f;
        var y1 = mapper.minZ - MapPadding - (size - mapHeight) / 2f;

        // City names and positions for the map's labels and search.
        Directory.CreateDirectory(outDir);
        mapper.ExportInfo(ExportFlags.CityList, outDir);
        if (maxZoom < 0) return 0; // maxZoom -1: cities only

        File.WriteAllText(Path.Combine(outDir, "tiles.json"), string.Format(CultureInfo.InvariantCulture,
            "{{\"x1\":{0},\"y1\":{1},\"x2\":{2},\"y2\":{3},\"minZoom\":0,\"maxZoom\":{4},\"tileSize\":{5}}}",
            x1, y1, x1 + size, y1 + size, maxZoom, TileSize));

        for (var z = 0; z <= maxZoom; z++)
        {
            var count = 1 << z;
            var zoom = TileSize * count / size; // pixels per metre at this level
            var done = 0;
            Parallel.For(0, count, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount }, x =>
            {
                Directory.CreateDirectory(Path.Combine(outDir, z.ToString(), x.ToString()));
                for (var y = 0; y < count; y++)
                {
                    var file = Path.Combine(outDir, z.ToString(), x.ToString(), y + ".png");
                    if (File.Exists(file)) continue;
                    var start = new PointF(x1 + x * TileSize / zoom, y1 + y * TileSize / zoom);
                    using (var bitmap = new Bitmap(TileSize, TileSize))
                    using (var g = Graphics.FromImage(bitmap))
                    {
                        lock (renderer) renderer.Render(g, new Rectangle(0, 0, TileSize, TileSize), zoom, start, palette, flags);
                        bitmap.Save(file, ImageFormat.Png);
                    }
                }
                var n = System.Threading.Interlocked.Increment(ref done);
                if (n % Math.Max(1, count / 8) == 0) Console.WriteLine("zoom {0}: {1}/{2} columns", z, n, count);
            });
            Console.WriteLine("zoom {0} done ({1} tiles)", z, count * count);
        }
        return 0;
    }
}
