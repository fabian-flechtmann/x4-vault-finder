function getStyle(o) {
    if (o["class"] == "station" && o["owner"] == "khaak") {
        var title = "";
        if (o["macro"].includes("_hive_")) {
            title = "Khaak Hive"
        }
        else if (o["macro"].includes("_nest_")) {
            title = "Khaak Nest"
        }
        else {
            title = "Khaak Weapon Platform"
        }
        if (o["is_wreck"]) {
            title += " (destroyed)"
        }
        return [
            title,
            "crimson"
        ]
    }
    else if (o["class"] == "station" && o["owner"] == "player") {
        var title = o["name"] || "Player Station"
        if (o["is_wreck"]) {
            title += " (destroyed)"
        }
        title = appendModules(title, o)
        return [
            title,
            "green"
        ]
    }
    else if (o["class"] == "station") {
        var title = capitalizeFirstLetter(o["owner"])
        if (o["is_headquarter"]) {
            title += " Headquarter"
        }
        else {
            title += " Station"
        }
        if (o["is_wreck"]) {
            title += " (destroyed)"
        }
        return [
            title,
            "silver"
        ]
    }
    else if (o["class"] == "gate") {
        let activity = o["is_active"] ? "" : "(Inactive) "
        return [
            activity + "Gate to " + o["target_sector_name"],
            "rgba(0, 0, 0, 0)"
        ]
    }
    else if (o["class"] == "highwayentrygate" || o["class"] == "highwayexitgate") {
        let direction = o["class"] == "highwayentrygate" ? "Entry to" : "Exit from"
        return [
            "Super Highway " + direction + " " + o["target_sector_name"],
            "rgba(0, 0, 0, 0)"
        ]
    }
    else if (o["class"].startsWith("ship")) {
        return [
            "Abandoned Ship (" + o["macro"] + ")",
            "goldenrod"
        ]
    }
    else if (o["has_blueprints"]) {
        return [
            "Vault with Blueprints",
            "dodgerblue"
        ]
    }
    else if (o["has_wares"]) {
        return [
            "Vault with Wares",
            "blueviolet"
        ]
    }
    else if (o["has_signalleak"]) {
        return [
            "Vault with Signal Leak",
            "mediumvioletred"
        ]
    }
    else {
        return [
            "Vault (empty)",
            "saddlebrown"
        ]
    }
}
function maybe_loot_tag(sector_data) {
    let has_blueprints = false;
    let has_wares = false;
    let has_signalleak = false;
    let has_empty_vault = false;
    for (let [code, object_data] of Object.entries(sector_data["objects"])) {
        if (object_data["has_blueprints"]) {
            has_blueprints = true;
        }
        if (object_data["has_wares"]) {
            has_wares = true;
        }
        if (object_data["has_signalleak"]) {
            has_signalleak = true;
        }
        if (!object_data["has_blueprints"] && !object_data["has_wares"] && (object_data["class"] == "datavault" || object_data["macro"].includes("erlking_vault"))) {
            has_empty_vault = true;
        }
    }
    if (has_blueprints) {
        return `<span class="tag blueprints">Vault with Blueprints</span>`
    }
    else if (has_wares) {
        return `<span class="tag wares">Vault with Wares</span>`
    }
    else if (has_signalleak) {
        return `<span class="tag signalleak">Vault with Signal Leak</span>`
    }
    else if (has_empty_vault) {
        return `<span class="tag empty">Vault (empty)</span>`
    }
    else {
        return ""
    }
}
function maybe_ship_tag(sector_data) {
    let has_abandoned_ship = false;
    for (let [code, object_data] of Object.entries(sector_data["objects"])) {
        if (object_data["class"].startsWith("ship_")) {
            has_abandoned_ship = true;
            break;
        }
    }
    if (has_abandoned_ship) {
        return `<span class="tag ship">Abandoned Ship</span>`
    }
    else {
        return ""
    }
}
function maybe_khaak_tag(sector_data) {
    let has_khaak_hive = false;
    let has_khaak_nest = false;
    for (let [code, object_data] of Object.entries(sector_data["objects"])) {
        if (object_data["is_wreck"] || object_data["owner"] != "khaak") {
            continue
        }
        if (object_data["macro"].includes("_hive_")) {
            has_khaak_hive = true;
        }
        else {
            has_khaak_nest = true;
        }
    }
    if (has_khaak_hive) {
        return `<span class="tag khaak">Khaak Hive</span>`
    }
    else if (has_khaak_nest) {
        return `<span class="tag khaak">Khaak Nest</span>`
    }
    else {
        return ""
    }
}
function maybe_player_tag(sector_data) {
    let station_count = 0;
    for (let [code, object_data] of Object.entries(sector_data["objects"])) {
        if (object_data["class"] == "station" && object_data["owner"] == "player" && !object_data["is_wreck"]) {
            station_count += 1;
        }
    }
    if (station_count > 0) {
        return `<span class="tag player">${station_count} Player Station${station_count > 1 ? "s" : ""}</span>`
    }
    else {
        return ""
    }
}
function maybe_headquarter_tag(sector_data) {
    var tags = ""
    for (let [code, object_data] of Object.entries(sector_data["objects"])) {
        if (object_data["is_headquarter"]) {
            let faction = capitalizeFirstLetter(object_data["owner"])
            tags += `<span class="tag headquarter">${faction} Headquarter</span>`
        }
    }
    return tags
}
function maybe_unexplored_tag(sector_data) {
    if (sector_data["is_known"]) {
        return ""
    }
    return `<span class="tag unexplored">Unexplored</span>`
}
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1)
}
function formatNumber(n) {
    // Large numbers are rounded to the nearest integer
    // Small numbers less than 10 show up to 2 decimals
    if (Math.abs(n) >= 1) {
        n = Math.round(n)
        return new Intl.NumberFormat().format(n)
    }
    return new Intl.NumberFormat("en-US", {maximumFractionDigits: 2}).format(n)
}
function get_points(objects) {
    return {
        x: objects.map(s => s["x"]),
        y: objects.map(s => s["y"]),
        z: objects.map(s => s["z"]),
        hoverinfo: "text",
        hovertext: objects.map(s => getStyle(s)[0]),
        name: "Unnamed",
        marker: {
            size: 5,
            color: objects.map(s => getStyle(s)[1])
        },
        mode: "markers+text",
        text: objects.map(s => s["code"]),
        textfont: {
            color: "#fafafa"
        },
        type: "scatter3d"
    }
}
function get_station_points(objects) {
    let points = get_points(objects.filter(o => o["class"] === "station"))
    points.name = "Stations"
    return points
}
function get_gate_points(objects) {
    let gate_objects = objects.filter(o => ["gate", "highwayentrygate", "highwayexitgate"].includes(o["class"]))
    let target_sector_macros = gate_objects.map(o => o["target_sector_macro"])
    let points = get_points(gate_objects)
    points.name = "Gates"
    points.target_sector_macros = target_sector_macros
    points.marker.line = {
        color: "#fafafa",
        width: 1
    }
    return points
}
function get_ship_points(objects) {
    let points = get_points(objects.filter(o => o["class"].startsWith("ship")))
    points.name = "Abandoned Ships"
    return points
}
function get_vault_points(objects) {
    let vault_objects = objects.filter(o => o["class"] == "datavault" || o["macro"].includes("_erlking_vault_"))
    let points = get_points(vault_objects)
    points.name = "Vaults"
    return points
}
function get_title_point(objects, sector_id) {
    let all_x = Object.values(objects).map(o => o.x)
    let all_y = Object.values(objects).map(o => o.y)
    let all_z = Object.values(objects).map(o => o.z)
    let min_x = Math.min(...all_x)
    let max_x = Math.max(...all_x)
    let max_y = Math.max(...all_y)
    let max_z = Math.max(...all_z)
    return {
        x: [(min_x + max_x) / 2.0],
        y: [max_y],
        z: [max_z],
        hovertemplate: "<extra></extra>",
        mode: "text",
        name: "Title",
        text: [window.data.sectors[sector_id].name],
        textfont: {
            size: 20,
            color: "#fafafa"
        },
        type: "scatter3d"
    }
}
function get_resource_points(resource_areas, color, resource_name) {
    let spots = resource_areas.filter(a => a["resources"][resource_name] !== undefined)
    let yields = spots.map(s => s["resources"][resource_name]["yield"])
    let hourly_spawn_rates = spots.map(s => s["resources"][resource_name]["recharge_max"] * 3600.0 / s["resources"][resource_name]["recharge_time"])
    let total_hourly_spawn = hourly_spawn_rates.reduce((a, b) => a + b, 0)
    let amount_max = spots.map(s => s["resources"][resource_name]["recharge_max"]).reduce((a, b) => a + b, 0)
    let amount_now = spots.map(s => s["resources"][resource_name]["recharge_current"]).reduce((a, b) => a + b, 0)
    return {
        x: spots.map(s => s.x),
        y: spots.map(s => s.y),
        z: spots.map(s => s.z),
        customdata: yields,
        hovertemplate: `
        Resource: ${capitalizeFirstLetter(resource_name)}<br>
        Yield: %{customdata}<br>
        Sector-wide stats:<br>
        * Resource areas: ${spots.length}<br>
        * Hourly spawn: ${formatNumber(total_hourly_spawn)}<br>
        * Amount max: ${formatNumber(amount_max)}<br>
        * Amount now: ${formatNumber(amount_now)}
        <extra></extra>`,
        mode: "markers",
        name: "Resource: " + capitalizeFirstLetter(resource_name),
        marker: {
            color: color,
            size: 5,
            symbol: "diamond",
            opacity: 0.2
        },
        type: "scatter3d",
        visible: "legendonly",
    }
}
var lastShowAt = null;
function show(sector_id, source) {
    if (lastShowAt !== null && performance.now() - lastShowAt < 200) {
        return
    }
    lastShowAt = performance.now()

    let sectorName = window.data.sectors[sector_id]?.name || sector_id;
    if (typeof trackSectorView === 'function') {
        trackSectorView(sectorName, source || 'sidebar');
    }

    for (let e of document.getElementsByClassName("sector")) {
        e.classList.remove("active")
    }
    document.getElementById(sector_id).classList.add("active")

    let sector = window.data.sectors[sector_id]
    let objects = Object.values(sector["objects"])
    let resource_areas = Object.values(sector["resource_areas"])
    let points = [
        get_station_points(objects),
        get_gate_points(objects),
        get_ship_points(objects),
        get_vault_points(objects),
        get_resource_points(resource_areas, "rgb(255, 238, 193)", "helium"),
        get_resource_points(resource_areas, "rgb(197, 255, 255)", "hydrogen"),
        get_resource_points(resource_areas, "rgb(255, 255, 255)", "ice"),
        get_resource_points(resource_areas, "rgb( 54, 124, 162)", "methane"),
        get_resource_points(resource_areas, "rgb(171,  32, 177)", "nividium"),
        get_resource_points(resource_areas, "rgb(255, 140,   0)", "ore"),
        get_resource_points(resource_areas, "rgb(252,  61,  57)", "rawscrap"),
        get_resource_points(resource_areas, "rgb(212, 211, 207)", "silicon"),
    ]
    points.push(get_title_point(objects, sector_id))
    let layout = {
        margin: {
            l: 0,
            r: 0,
            b: 0,
            t: 0
        },
        paper_bgcolor: "#252627",
        hoverlabel: {
            align: "left"
        },
        hovermode: "closest",
        legend: {
            font: {
                color: "#fafafa"
            },
            itemdoubleclick: false,
            y: 0,
            xanchor: 'right',
            yanchor: 'bottom'
        },
        scene: {
            xaxis: {
                title: "X",
                color: "#fafafa",
                gridcolor: "silver",
                zerolinecolor: "#fafafa",
                autorange: "reversed"
            },
            yaxis: {
                title: "Y",
                color: "#fafafa",
                gridcolor: "silver",
                zerolinecolor: "#fafafa"
            },
            zaxis: {
                title: "Z",
                color: "#fafafa",
                gridcolor: "silver",
                zerolinecolor: "#fafafa"
            },
            aspectmode: "data",
            camera: {
                eye: { x: 0, y: 4, z: 0 },
                up: { x: 0, y: 0, z: 1 }
            }
        },
        showlegend: true
    };
    setTimeout(
        () => {
            let plotDiv = document.getElementById("plot")
            plotDiv.innerHTML = "";
            Plotly.newPlot("plot", points, layout)
            plotDiv.on("plotly_click", function(data) {
                let pointNumber = data["points"][0]["pointNumber"]
                let target_sector_macros = data["points"][0]["data"]["target_sector_macros"]
                if (target_sector_macros === undefined) {
                    return
                }
                let macro = target_sector_macros[pointNumber]
                if (macro === undefined) {
                    return
                }
                show(macro, 'gate')
            });
        },
        0
    );
}
window.addEventListener("resize", () => {
    Plotly.Plots.resize("plot");
});

function formatMacroName(macro) {
    return macro
        .replace(/_macro$/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

function appendModules(title, o) {
    if (o["modules"]) {
        let modules = [];
        for (let [macro, count] of Object.entries(o["modules"])) {
            modules.push(count + "x " + formatMacroName(macro));
        }
        modules.sort();
        if (modules.length > 0) {
            title += "<br>Modules:<br>" + modules.join("<br>");
        }
    }
    return title;
}
