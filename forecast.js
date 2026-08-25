//Settings

const GRID_ROWS = 20;
const GRID_COLS = 30;
const GRID_SPACING = 1;
const CENTER_LAT = 20;
const CENTER_LON = 110;

const ISOBAR_INTERVAL = 4;



const loadButton = document.getElementById("loadGFS");
const status = document.getElementById("modelStatus");
const canvas = document.getElementById("modelCanvas");
const ctx = canvas.getContext("2d");

const forecastSlider =
    document.getElementById("forecastSlider");

const forecastTime =
    document.getElementById("forecastTime");

const prevForecast =
    document.getElementById("prevForecast");

const nextForecast =
    document.getElementById("nextForecast");


document
    .getElementById("pressureMode")
    .addEventListener("click", () => {
        currentMode = "pressure";
        drawForecast(currentForecastIndex);
    });

document
    .getElementById("precipMode")
    .addEventListener("click", () => {
        currentMode = "precipitation";
        drawForecast(currentForecastIndex);
    });

document
    .getElementById("windMode")
    .addEventListener("click", () => {
        currentMode = "wind";
        drawForecast(currentForecastIndex);
    });

document
    .getElementById("irMode")
    .addEventListener("click", () => {
        currentMode = "ir";
        drawForecast(currentForecastIndex);
    });

let currentForecastIndex = 0;

let cachedGFSData = null;
let currentMode = "pressure";
let minLat;
let maxLat;
let minLon;
let maxLon;
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";

loadButton.addEventListener("click", loadGFS);

let worldLand = null;

async function loadCoastlines() {
    const response = await fetch("/data/land-50m.json");
    const topology = await response.json();

    worldLand = feature(
        topology,
        topology.objects.land
    );

    console.log("World coastline loaded:", worldLand);
}

loadCoastlines();

async function loadGFS() {

    // Already downloaded it
    if (cachedGFSData) {
        drawPressureGrid(cachedGFSData, 0);
        status.textContent = "Using cached GFS data.";
        return;
    }

    status.textContent = "Loading GFS grid...";

    const centerLat = CENTER_LAT;
    const centerLon = CENTER_LON;

    const rows = GRID_ROWS;
    const cols = GRID_COLS;

    // Distance between sampling points in degrees
    const spacing = GRID_SPACING;

    minLat =
    centerLat - ((rows - 1) / 2) * spacing;

    maxLat =
        centerLat + ((rows - 1) / 2) * spacing;

    minLon =
        centerLon - ((cols - 1) / 2) * spacing;

    maxLon =
        centerLon + ((cols - 1) / 2) * spacing;

    

    const points = [];

    // Generate our 10x10 coordinate grid
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {

            const lat =
                centerLat +
                (y - (rows - 1) / 2) * spacing;

            const lon = normalizeLongitude(
                centerLon +
                (x - (cols - 1) / 2) * spacing
            );

            points.push({
                lat,
                lon
            });
        }
    }

    console.log(points);

    status.textContent =
        `Created ${points.length} grid points.`;

    await fetchGFSGrid(points);
}

async function fetchGFSGrid(points) {
    const batchSize = 100;
    const allData = [];

    status.textContent = "Loading grid...";

    try {
        for (let i = 0; i < points.length; i += batchSize) {

            const batch = points.slice(i, i + batchSize);

            const latitudes = batch
                .map(p => p.lat)
                .join(",");

            const longitudes = batch
                .map(p => p.lon)
                .join(",");

            const url =
                `https://api.open-meteo.com/v1/gfs?` +
                `latitude=${latitudes}` +
                `&longitude=${longitudes}` +
                `&hourly=pressure_msl,precipitation,wind_speed_10m,cloud_cover_300hPa,cloud_cover_500hPa,cloud_cover_250hPa,cloud_cover_200hPa,temperature_500hPa,temperature_300hPa,temperature_250hPa,temperature_200hPa,cloud_cover_high` +
                `&wind_speed_unit=kn` +
                `&models=gfs_seamless`;

            status.textContent =
                `Loading ${Math.min(i + batchSize, points.length)} / ${points.length} points...`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(
                    `HTTP error ${response.status}`
                );
            }

            const data = await response.json();

            // Multiple locations should return an array
            if (Array.isArray(data)) {
                allData.push(...data);
            } else {
                allData.push(data);
            }
        }

        console.log("FULL GFS GRID:", allData);

        cachedGFSData = allData;

        setupTimeline();

        drawForecast(0);

        status.textContent =
            `Grid loaded!`;

    } catch (error) {
        console.error(error);

        status.textContent =
            "Failed to load grid.";
    }
}

function drawPressureGrid(data, forecastIndex) {
    const rows = GRID_ROWS;
    const cols = GRID_COLS;

    // Turn API results into a proper 2D pressure grid
    const grid = [];
    const pressureGrid = [];
    const cloudTopGrid = [];

    for (let row = 0; row < rows; row++) {
    grid[row] = [];
    pressureGrid[row] = [];
    cloudTopGrid[row] = [];

    for (let col = 0; col < cols; col++) {
        const index = row * cols + col;

        if (currentMode !== "ir") {
            grid[row][col] = getValue(
                data[index],
                forecastIndex
            );
        }

        // Pressure for isobars
        pressureGrid[row][col] =
            data[index].hourly
                .pressure_msl[forecastIndex];

        // Estimated cloud-top temperature for simulated IR
        cloudTopGrid[row][col] =
            estimatedCloudTopTemp(
                data[index],
                forecastIndex
            );
        }
    }

    // Create raw pixel image
    const imageData = ctx.createImageData(
        canvas.width,
        canvas.height
    );

    const pixels = imageData.data;

    for (let py = 0; py < canvas.height; py++) {

        // Convert canvas Y into grid coordinates.
        // Reverse because north should be at the top.
        const gridY =
            (1 - py / (canvas.height - 1)) *
            (rows - 1);

        const y0 = Math.floor(gridY);
        const y1 = Math.min(y0 + 1, rows - 1);

        const fy = gridY - y0;

        for (let px = 0; px < canvas.width; px++) {

            const gridX =
                (px / (canvas.width - 1)) *
                (cols - 1);

            const x0 = Math.floor(gridX);
            const x1 = Math.min(x0 + 1, cols - 1);

            const fx = gridX - x0;

            let color;

            if (currentMode === "ir") {

                

                const cloudTopTemp = bilinearValue(
                    cloudTopGrid,
                    x0, x1,
                    y0, y1,
                    fx, fy
                );

                color = irColorRGB(cloudTopTemp);
            } else {

                const value = bilinearValue(
                    grid,
                    x0, x1,
                    y0, y1,
                    fx, fy
                );

                 switch (currentMode) {
                case "pressure":
                    color = pressureColorRGB(value);
                    break;

                case "precipitation":
                    color = precipitationColorRGB(value);
                    break;

                case "wind":
                    color = windColorRGB(value);
                    break;
            }

            }

           

            const pixelIndex =
                (py * canvas.width + px) * 4;

            pixels[pixelIndex] = color.r;
            pixels[pixelIndex + 1] = color.g;
            pixels[pixelIndex + 2] = color.b;
            pixels[pixelIndex + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    const smoothPressureGrid =
    interpolateGrid(
        pressureGrid,
        100,
        100
    );

    drawIsobars(smoothPressureGrid);

    drawCoastlines();
}


function pressureColorRGB(pressure) {

    // Clamp pressure to our scale
    pressure = Math.max(950, Math.min(1040, pressure));

    // 950 → 980
    if (pressure <= 980) {
        const t = (pressure - 950) / 30;

        return interpolateColor(
            { r: 255, g: 0,   b: 255 }, // purple
            { r: 0,   g: 0,  b: 255 }, // blue
            t
        );
    }

    // 980 → 1013
    if (pressure <= 1013) {
        const t = (pressure - 980) / 33;

        return interpolateColor(
            { r: 0,   g: 0,  b: 255 }, // blue
            { r: 255, g: 255, b: 255 }, // white
            t
        );
    }

    // 1013 → 1040
    const t = (pressure - 1013) / 37;

    return interpolateColor(
        { r: 255, g: 255, b: 255 }, // white
        { r: 255, g: 0,   b: 0   }, // red
        t
    );
}

function precipitationColorRGB(mm) {

    // no precip
    if (mm <= 0) {
        return { r: 255, g: 255, b: 255 };
    }

    // 0 → 1 mm/hr
    if (mm <= 1) {
        const t = mm / 1;

        return interpolateColor(
            { r: 255, g: 255, b: 255 },
            { r: 100, g: 220, b: 100 },
            t
        );
    }

    // 1 → 5 mm/hr
    if (mm <= 5) {
        const t = (mm - 1) / 4;

        return interpolateColor(
            { r: 100, g: 220, b: 100 },
            { r: 255, g: 220, b: 0 },
            t
        );
    }

    // 5 → 15 mm/hr
    if (mm <= 15) {
        const t = (mm - 5) / 10;

        return interpolateColor(
            { r: 255, g: 220, b: 0 },
            { r: 255, g: 0, b: 0 },
            t
        );
    }

    // 15 → 30 mm/hr
    if (mm <= 30) {
        const t = (mm - 15) / 15;

        return interpolateColor(
            { r: 255, g: 0, b: 0 },
            { r: 120, g: 0, b: 0 },
            t
        );
    }

    // 30+ mm/hr
    return { r: 180, g: 0, b: 180 };
}

function windColorRGB(wind) {

    // 0 → 30
    if (wind <= 30) {
        const t = wind / 30;

        return interpolateColor(
            { r: 255, g: 255, b: 255 },
            { r: 0, g: 200, b: 255 },
            t
        );
    }

    // 30 → 60
    if (wind <= 60) {
        const t = (wind - 30) / 30;

        return interpolateColor(
            { r: 0, g: 200, b: 255 },
            { r: 0, g: 220, b: 80 },
            t
        );
    }

    // 60 → 90
    if (wind <= 90) {
        const t = (wind - 60) / 30;

        return interpolateColor(
            { r: 0, g: 220, b: 80 },
            { r: 255, g: 255, b: 0 },
            t
        );
    }

    // 90 → 120
    if (wind <= 120) {
        const t = (wind - 90) / 30;

        return interpolateColor(
            { r: 255, g: 255, b: 0 },
            { r: 255, g: 80, b: 0 },
            t
        );
    }

    // 120 → 160
    if (wind <= 160) {
        const t = (wind - 120) / 40;

        return interpolateColor(
            { r: 255, g: 80, b: 0 },
            { r: 180, g: 0, b: 200 },
            t
        );
    }

    return {
        r: 180,
        g: 0,
        b: 200
    };
}

function interpolateColor(color1, color2, t) {
    return {
        r: Math.round(
            color1.r + (color2.r - color1.r) * t
        ),

        g: Math.round(
            color1.g + (color2.g - color1.g) * t
        ),

        b: Math.round(
            color1.b + (color2.b - color1.b) * t
        )
    };
}

function geoToCanvas(lat, lon) {

    const x =
        ((lon - minLon) /
        (maxLon - minLon))
        * canvas.width;

    const y =
        ((maxLat - lat) /
        (maxLat - minLat))
        * canvas.height;

    return { x, y };
}

function drawCoastlines() {

    if (!worldLand) return;

    ctx.save();

    ctx.strokeStyle = "black";
    ctx.lineWidth = 1.5;

    for (const geometry of worldLand.features) {

        if (geometry.geometry.type === "Polygon") {

            drawPolygon(
                geometry.geometry.coordinates
            );

        } else if (
            geometry.geometry.type === "MultiPolygon"
        ) {

            for (const polygon of geometry.geometry.coordinates) {
                drawPolygon(polygon);
            }
        }
    }

    ctx.restore();
}

function drawPolygon(rings) {

    for (const ring of rings) {

        ctx.beginPath();

        for (let i = 0; i < ring.length; i++) {

            const [lon, lat] = ring[i];

            const p = geoToCanvas(lat, lon);

            if (i === 0) {
                ctx.moveTo(p.x, p.y);
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }

        ctx.closePath();
        ctx.stroke();
    }
}

function drawIsobars(grid) {
    const rows = grid.length;
    const cols = grid[0].length;

    // Find actual pressure range
    let minP = Infinity;
    let maxP = -Infinity;

    for (const row of grid) {
        for (const p of row) {
            if (p < minP) minP = p;
            if (p > maxP) maxP = p;
        }
    }

    // Draw one isobar every 2 mb
    const interval = ISOBAR_INTERVAL;

    const firstLevel =
        Math.ceil(minP / interval) * interval;

    const lastLevel =
        Math.floor(maxP / interval) * interval;

    for (
        let level = firstLevel;
        level <= lastLevel;
        level += interval
    ) {
        drawIsobarLevel(grid, level);
    }
}

function drawIsobarLevel(grid, level) {
    const rows = grid.length;
    const cols = grid[0].length;

    const cellWidth =
        canvas.width / (cols - 1);

    const cellHeight =
        canvas.height / (rows - 1);

    ctx.beginPath();

    let labelPoint = null;

    for (let row = 0; row < rows - 1; row++) {

        for (let col = 0; col < cols - 1; col++) {

            const yTop =
                canvas.height -
                (row + 1) * cellHeight;

            const yBottom =
                canvas.height -
                row * cellHeight;

            const xLeft =
                col * cellWidth;

            const xRight =
                (col + 1) * cellWidth;

            const p00 = grid[row][col];
            const p10 = grid[row][col + 1];
            const p01 = grid[row + 1][col];
            const p11 = grid[row + 1][col + 1];

            const intersections = [];

            addContourIntersection(
                intersections,
                p00,
                p01,
                level,
                xLeft,
                yBottom,
                xLeft,
                yTop
            );

            addContourIntersection(
                intersections,
                p10,
                p11,
                level,
                xRight,
                yBottom,
                xRight,
                yTop
            );

            addContourIntersection(
                intersections,
                p00,
                p10,
                level,
                xLeft,
                yBottom,
                xRight,
                yBottom
            );

            addContourIntersection(
                intersections,
                p01,
                p11,
                level,
                xLeft,
                yTop,
                xRight,
                yTop
            );

            if (intersections.length === 2) {

                ctx.moveTo(
                    intersections[0].x,
                    intersections[0].y
                );

                ctx.lineTo(
                    intersections[1].x,
                    intersections[1].y
                );

                // Save one point for the label
                if (!labelPoint) {
                    labelPoint = {
                        x:
                            (intersections[0].x +
                             intersections[1].x) / 2,

                        y:
                            (intersections[0].y +
                             intersections[1].y) / 2
                    };
                }
            }

            else if (intersections.length === 4) {

                ctx.moveTo(
                    intersections[0].x,
                    intersections[0].y
                );

                ctx.lineTo(
                    intersections[1].x,
                    intersections[1].y
                );

                ctx.moveTo(
                    intersections[2].x,
                    intersections[2].y
                );

                ctx.lineTo(
                    intersections[3].x,
                    intersections[3].y
                );

                if (!labelPoint) {
                    labelPoint = {
                        x:
                            (intersections[0].x +
                             intersections[1].x) / 2,

                        y:
                            (intersections[0].y +
                             intersections[1].y) / 2
                    };
                }
            }
        }
    }

    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw pressure label
    if (labelPoint) {

        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.fillStyle = "black";

        ctx.fillText(
            String(level),
            labelPoint.x,
            labelPoint.y
        );
    }
}

function addContourIntersection(
    intersections,
    value1,
    value2,
    level,
    x1,
    y1,
    x2,
    y2
) {

    // Check whether the contour crosses this edge
    if (
        (value1 < level && value2 >= level) ||
        (value2 < level && value1 >= level)
    ) {

        const t =
            (level - value1) /
            (value2 - value1);

        intersections.push({
            x: x1 + (x2 - x1) * t,
            y: y1 + (y2 - y1) * t
        });
    }
}

function drawForecast(index) {
    currentForecastIndex = index;

    drawPressureGrid(
        cachedGFSData,
        currentForecastIndex
    );

    updateForecastTime();
}

function setupTimeline() {

    if (!cachedGFSData) return;

    const times =
        cachedGFSData[0].hourly.time;

    forecastSlider.min = 0;
    forecastSlider.max = times.length - 1;
    forecastSlider.value = 0;

    currentForecastIndex = 0;

    updateForecastTime();
}

forecastSlider.addEventListener("input", () => {

    const index =
        Number(forecastSlider.value);

    drawForecast(index);
});

prevForecast.addEventListener("click", () => {

    if (!cachedGFSData) return;

    currentForecastIndex--;

    if (currentForecastIndex < 0) {
        currentForecastIndex = 0;
    }

    forecastSlider.value =
        currentForecastIndex;

    drawForecast(
        currentForecastIndex
    );
});

nextForecast.addEventListener("click", () => {

    if (!cachedGFSData) return;

    const max =
        cachedGFSData[0].hourly.time.length - 1;

    currentForecastIndex++;

    if (currentForecastIndex > max) {
        currentForecastIndex = max;
    }

    forecastSlider.value =
        currentForecastIndex;

    drawForecast(
        currentForecastIndex
    );
});



function updateForecastTime() {

    if (!cachedGFSData) return;

    const time =
        cachedGFSData[0]
            .hourly
            .time[currentForecastIndex];

    const date = new Date(time + "Z");

    forecastTime.textContent =
        date.toUTCString();
}

function getValue(location, forecastIndex) {

    if (currentMode === "pressure") {
        return location.hourly.pressure_msl[forecastIndex];
    }

    if (currentMode === "precipitation") {
        return location.hourly.precipitation[forecastIndex];
    }

    if (currentMode === "wind") {
        return location.hourly.wind_speed_10m[forecastIndex];
    }
}

function normalizeLongitude(lon) {
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return lon;
}

function interpolateGrid(grid, newRows, newCols) {
    const oldRows = grid.length;
    const oldCols = grid[0].length;

    const result = [];

    for (let y = 0; y < newRows; y++) {
        result[y] = [];

        const gy =
            (y / (newRows - 1)) * (oldRows - 1);

        const y0 = Math.floor(gy);
        const y1 = Math.min(y0 + 1, oldRows - 1);

        const fy = gy - y0;

        for (let x = 0; x < newCols; x++) {
            const gx =
                (x / (newCols - 1)) * (oldCols - 1);

            const x0 = Math.floor(gx);
            const x1 = Math.min(x0 + 1, oldCols - 1);

            const fx = gx - x0;

            const p00 = grid[y0][x0];
            const p10 = grid[y0][x1];
            const p01 = grid[y1][x0];
            const p11 = grid[y1][x1];

            const top =
                p00 * (1 - fx) +
                p10 * fx;

            const bottom =
                p01 * (1 - fx) +
                p11 * fx;

            result[y][x] =
                top * (1 - fy) +
                bottom * fy;
        }
    }

    return result;
}

function irColorRGB(tempC) {

    // Clamp temperature to palette range
    tempC = Math.max(-80, Math.min(20, tempC));

    let color;

    // +20 → -10 : black → light gray
    if (tempC >= -10) {
        const t = (20 - tempC) / 30;

        color = interpolateColor(
            { r: 0,   g: 0,   b: 0   },
            { r: 230, g: 230, b: 230 },
            t
        );
    }

    // -10 → -20 : light gray → white
    else if (tempC >= -20) {
        const t = (-10 - tempC) / 10;

        color = interpolateColor(
            { r: 230, g: 230, b: 230 },
            { r: 255, g: 255, b: 255 },
            t
        );
    }

    // -20 → -30 : cyan → dark blue
    else if (tempC >= -30) {
        const t = (-20 - tempC) / 10;

        color = interpolateColor(
            { r: 0, g: 230, b: 230 },
            { r: 0, g: 0,   b: 130 },
            t
        );
    }

    // -30 → -40 : dark blue → bright green
    else if (tempC >= -40) {
        const t = (-30 - tempC) / 10;

        color = interpolateColor(
            { r: 0, g: 0,   b: 130 },
            { r: 0, g: 255, b: 0   },
            t
        );
    }

    // -40 → -50 : green → yellow
    else if (tempC >= -50) {
        const t = (-40 - tempC) / 10;

        color = interpolateColor(
            { r: 0,   g: 255, b: 0 },
            { r: 255, g: 255, b: 0 },
            t
        );
    }

    // -50 → -60 : yellow → red
    else if (tempC >= -60) {
        const t = (-50 - tempC) / 10;

        color = interpolateColor(
            { r: 255, g: 255, b: 0 },
            { r: 255, g: 0,   b: 0 },
            t
        );
    }

    // -60 → -70 : red → black
    else if (tempC >= -70) {
        const t = (-60 - tempC) / 10;

        color = interpolateColor(
            { r: 255, g: 0, b: 0 },
            { r: 0,   g: 0, b: 0 },
            t
        );
    }

    // -70 → -80 : black → white
    else {
        const t = (-70 - tempC) / 10;

        color = interpolateColor(
            { r: 0,   g: 0,   b: 0   },
            { r: 255, g: 255, b: 255 },
            t
        );
    }
    return color;
}

function bilinearValue(
    grid,
    x0, x1,
    y0, y1,
    fx, fy
) {
    const v00 = grid[y0][x0];
    const v10 = grid[y0][x1];
    const v01 = grid[y1][x0];
    const v11 = grid[y1][x1];

    const top =
        v00 * (1 - fx) +
        v10 * fx;

    const bottom =
        v01 * (1 - fx) +
        v11 * fx;

    return (
        top * (1 - fy) +
        bottom * fy
    );
}

function estimatedCloudTopTemp(location, forecastIndex) {
    const h = location.hourly;

    // Highest/coldest layer first

    if (h.cloud_cover_200hPa[forecastIndex] > 50) {
        return h.temperature_200hPa[forecastIndex];
    }

    if (h.cloud_cover_250hPa[forecastIndex] > 50) {
        return h.temperature_250hPa[forecastIndex];
    }

    if (h.cloud_cover_300hPa[forecastIndex] > 50) {
        return h.temperature_300hPa[forecastIndex];
    }

    if (h.cloud_cover_500hPa[forecastIndex] > 50) {
        return h.temperature_500hPa[forecastIndex];
    }

    // No significant cloud
    return 15;
}