let victors_cache = {};
let hardest_cache = {};
let diff_count_cache = {};
let bonus_xp_cache = {};
let abbr_cache = {};
let tower_lookup = {};
let player_lookup = {};
let pack_victors_cache = {};

function precompute_caches() {
    tower_lookup = {};
    for (let tower of towers) {
        tower_lookup[tower.id] = tower;
    }

    player_lookup = {};
    for (let player of completions) {
        player_lookup[player.username] = player;
    }

    victors_cache = victors_by_tower;
    hardest_cache = hardest_by_player;
    diff_count_cache = diff_count_by_player;
    bonus_xp_cache = bonus_xp_by_player;
    pack_victors_cache = pack_victors_by_pack;

    abbr_cache = {};
    for (let tower of towers) {
        abbr_cache[tower.id] = getAbbr(tower.name);
    }
}

const quality_order = {
    "SS": 0, "S+": 1, "S": 2, "S-": 3,
    "A+": 4, "A": 5, "A-": 6,
    "B+": 7, "B": 8, "B-": 9,
    "C+": 10, "C": 11, "C-": 12,
    "D+": 13, "D": 14, "D-": 15,
    "F+": 16, "F": 17, "F-": 18,
    "X": 19
};

function init_towers() {
    let sort = $("#tower-sort").val() || "difficulty";
    let dir = $("#tower-sort-dir").attr("data-dir") || "desc";
    let sorted_towers = [...towers];

    if (sort === "difficulty") {
        sorted_towers.sort((a, b) => dir === "desc" ? b.difficulty - a.difficulty || a.rank - b.rank : a.difficulty - b.difficulty || a.rank - b.rank);
    } else if (sort === "victors") {
        sorted_towers.sort((a, b) => dir === "desc" ? victors_cache[b.id] - victors_cache[a.id] || a.rank - b.rank : victors_cache[a.id] - victors_cache[b.id] || a.rank - b.rank);
    } else if (sort === "quality") {
        sorted_towers = sorted_towers.filter(t => t.quality != null);
        sorted_towers.sort((a, b) => {
            const qa = quality_order[a.quality] ?? 20;
            const qb = quality_order[b.quality] ?? 20;
            return dir === "desc" ? qa - qb || a.rank - b.rank : qb - qa || a.rank - b.rank;
        });
    }

    let tbody = "";
    for (let t of sorted_towers) {
        let diff = t["difficulty"] / 100;
        let victors = victors_cache[t["id"]];

        let last;
        if (sort === "victors") {
            last = `<span style="text-align: right;">${victors}</span>`;
        } else if (sort === "quality") {
            last = `<span class="${quality_class(t.quality)}">${t.quality}</span>`;
        } else {
            last = `<span class="${difficulty_to_name(diff * 100)}">${formatNumber(diff)}</span>`;
        }
        
        tbody += `
            <tr data-name="${t["name"].toLowerCase()}"
                data-abbr="${abbr_cache[t["id"]].toLowerCase()}"
                data-diff="${Math.floor(diff)}"
                data-places="${t["places"].map(p => p[0]).join(",")}"
                data-victors="${victors}">
                <td class="${difficulty_to_name(t["difficulty"])}">#${t["rank"]}</td>
                <td><button class="tower-button" onclick="open_tower(${t["id"]})">${t["name"]}</button></td>
                <td style="text-align: right;">${last}</td>
            </tr>
        `;
    }
    $("#searchmenu-table").html(tbody);
    filter_towers();
}

function filter_towers() {
    const search = $("#unified-search").val().toLowerCase();
    const allowed_difficulties = [];
    const place_filter = $("#game-select").val();

    let mapped_towers = new Set();
    let player = player_from_name($("#checklist-player").val());

    if (player) {
        for (let c of player["completions"]) {
            let tower = tower_lookup[c];
            if (tower) {
                mapped_towers.add(tower["name"].toLowerCase());
            }
        }
    }

    for (let i = 8; i < 14; i++) {
        if ($("#diff-" + i).prop("checked")) {
            allowed_difficulties.push(i);
        }
    }

    const rows = document.getElementById("searchmenu-table").rows;
    for (const row of rows) {
        const name = row.dataset.name;
        const abbr = row.dataset.abbr;
        const diff = +row.dataset.diff;
        const places = row.dataset.places;

        let visible = true;

        if (!(name.includes(search) || abbr.includes(search))) visible = false;
        if (!allowed_difficulties.includes(diff)) visible = false;
        if (place_filter && !places.split(",").includes(place_filter)) visible = false;

        row.style.display = visible ? "" : "none";

        const button = row.querySelector("button");
        if (mapped_towers.has(name)) {
            button.classList.remove("tower-button");
            button.classList.add("tower-button-crossed");
        } else {
            button.classList.remove("tower-button-crossed");
            button.classList.add("tower-button");
        }
    }
}

function init_players() {
    let sort = $("#player-sort").val() || "xp";
    let dir = $("#player-sort-dir").attr("data-dir") || "desc";
    let players = [...completions];

    const diff_sort_map = {
        "most-insane": "Insane", "most-extreme": "Extreme", "most-terrifying": "Terrifying",
        "most-catastrophic": "Catastrophic", "most-horrific": "Horrific", "most-unreal": "Unreal"
    };

    const sign = dir === "desc" ? 1 : -1;
    if (sort === "xp") {
        players.sort((a, b) => sign * (b.total_xp - a.total_xp));
    } else if (sort === "completions") {
        players.sort((a, b) => sign * (b.completions.length - a.completions.length) || b.total_xp - a.total_xp);
    } else if (sort === "hardest") {
        players.sort((a, b) => sign * (hardest_cache[b.username] - hardest_cache[a.username]) || b.total_xp - a.total_xp);
    } else if (sort in diff_sort_map) {
        const d = diff_sort_map[sort];
        players.sort((a, b) => sign * ((diff_count_cache[b.username][d] || 0) - (diff_count_cache[a.username][d] || 0)) || b.total_xp - a.total_xp);
    }

    let tbody = "";
    players.forEach((player, index) => {
        let p_name = player["username"];
        let p_xp = player["total_xp"];
        let display_rank = index + 1;
        let third_column;
        if (sort === "xp") {
            if (dir === "asc" && p_xp === 0) return;
            third_column = `Level ${format_level(p_xp, true)}`;
        } else if (sort === "completions") {
            if (dir === "asc" && player["completions"].length === 0) return;
            third_column = `${player["completions"].length} SCs`;
        } else if (sort === "hardest") {
            let hardest_diff = hardest_cache[p_name];
            if (dir === "asc" && hardest_diff === 0) return;
            let diff_class = difficulty_to_name(hardest_diff);
            third_column = `<span class="${diff_class}">${formatNumber(hardest_diff / 100)}</span>`;
        } else if (sort in diff_sort_map) {
            const d = diff_sort_map[sort];
            const count = diff_count_cache[p_name][d] || 0;
            if (count === 0) return;
            third_column = `<span class="${d}">${count} ${d}s</span>`;
        }

        tbody += `
            <tr data-name="${p_name.toLowerCase()}" data-nationality="${player.nationality || ""}">
                <td>#${display_rank}</td>
                <td><button class="player-button" onclick='open_player("${p_name}", ${display_rank})'>${get_role(p_name, true)}</button></td>
                <td style="text-align: right;">${third_column}</td>
            </tr>
        `;
    });
    $("#leaderboard-table").html(tbody);
}

function filter_players() {
    const search = $("#unified-search").val().toLowerCase();
    const country = $("#player-country").val();

    const rows = document.getElementById("leaderboard-table").rows;
    for (const row of rows) {
        const name = row.dataset.name;
        const nationality = row.dataset.nationality;

        let visible = name.includes(search);
        if (country && nationality !== country) visible = false;
        row.style.display = visible ? "" : "none";
    }
}

function filter_packs() {
    const search = $("#unified-search").val().toLowerCase();

    const rows = document.getElementById("packs-table").rows;
    for (const row of rows) {
        const name = row.dataset.name;
        row.style.display = name.includes(search) ? "" : "none";
    }
}

function init_packs() {
    let sort = $("#pack-sort").val() || "xp";
    let dir = $("#pack-sort-dir").attr("data-dir") || "asc";
    let sign = dir === "desc" ? -1 : 1;

    let ranked_packs = [...packs].sort((a, b) => b.xp - a.xp);
    let rank_lookup = {};
    ranked_packs.forEach((pack, i) => rank_lookup[pack.id] = i + 1);

    let sorted_packs = [...packs];
    if (sort === "xp") {
        sorted_packs.sort((a, b) => sign * (a.xp - b.xp));
    } else if (sort === "towers") {
        sorted_packs.sort((a, b) => sign * (a.towers.length - b.towers.length));
    } else if (sort === "hardest") {
        sorted_packs.sort((a, b) => sign * (get_hardest_tower(a.towers.map(Number)) - get_hardest_tower(b.towers.map(Number))));
    } else if (sort === "quality") {
        sorted_packs = sorted_packs.filter(p => get_average_quality(p.towers.map(Number)) != null);
        sorted_packs.sort((a, b) => {
            const qa = quality_order[get_average_quality(a.towers.map(Number))];
            const qb = quality_order[get_average_quality(b.towers.map(Number))];
            return sign * (qa - qb);
        });
    }

    let tbody = "";
    sorted_packs.forEach(pack => {
        let player = player_from_name($("#checklist-player").val());
        let completed_count = player ? pack.towers.filter(id => player.completions.includes(parseInt(id))).length : 0;
        let avg_diff = get_average_difficulty(pack.towers.map(Number));

        let last;
        if (sort === "hardest") {
            let hardest_diff = get_hardest_tower(pack.towers.map(Number));
            last = `<span class="${difficulty_to_name(hardest_diff)}">${formatNumber(hardest_diff / 100)}</span>`;
        } else if (sort === "towers") {
            last = `<span style="text-align: right;">${completed_count}/${pack.towers.length}</span>`;
        } else if (sort === "quality") {
            let avg_quality = get_average_quality(pack.towers.map(Number));
            last = `<span class="${quality_class(avg_quality)}">${avg_quality}</span>`;
        } else {
            last = `<span style="text-align: right;">${formatNumber(pack["xp"])} XP</span>`;
        }

        let pack_completed = pack.towers.length > 0 && completed_count === pack.towers.length;

        tbody += `
            <tr data-name="${pack.name.toLowerCase()}">
                <td class="${difficulty_to_name(avg_diff)}">#${rank_lookup[pack.id]}</td>
                <td><button class="${pack_completed ? 'pack-button-crossed' : 'pack-button'}" onclick="open_pack('${pack.id}')">${pack.name}</button></td>
                <td style="text-align: right;">${last}</td>
            </tr>
        `;
    });
    $("#packs-table").html(tbody);
}

function open_pack(id) {
    current_pack_id = id;
    open_page("Packs");
    let pack = packs.find(p => p.id === id);
    let player = player_from_name($("#checklist-player").val());
    let completed_count = player ? pack.towers.filter(id => player.completions.includes(parseInt(id))).length : 0;
    let total_count = pack.towers.length;

    $("#packname").html(pack.name);
    $("#packprogress").html(`${completed_count}/${total_count}`);
    $("#packbonus").html(`${formatNumber(pack.xp)} XP`);
    
    let victors = get_pack_victors(id);
    $("#packvictors").html(victors.length);

    let tbody = "";
    let sorted_tower_ids = [...pack.towers].sort((a, b) => (tower_lookup[parseInt(a)]?.difficulty ?? -Infinity) - (tower_lookup[parseInt(b)]?.difficulty ?? -Infinity));
    sorted_tower_ids.forEach(id => {
        let tower = tower_lookup[parseInt(id)];
        if (tower) {
            let diff = tower.difficulty / 100;
            let completed = player && player.completions.includes(parseInt(id));
            tbody += `
                <tr>
                    <td class="${difficulty_to_name(tower.difficulty)}">#${tower.rank}</td>
                    <td><button class="${completed ? 'tower-button-crossed' : 'tower-button'}" onclick="open_tower(${id})">${tower.name}</button></td>
                    <td><span class="${difficulty_to_name(tower.difficulty)}">${formatNumber(diff)}</span></td>
                </tr>
            `;
        }
    });
    $("#packtowers-table").html(tbody);
    
    $("#packvictorstable").html("");
    if (victors.length > 0) {
        for (let username of victors) {
            let v = player_lookup[username];
            if (v) {
                let row = `
                    <tr data-name="${username.toLowerCase()}">
                        <td>#${v.rank}</td>
                        <td><button class="player-button" onclick='open_player("${username}")'>${get_role(username, true)}</button></td>
                        <td style="text-align: right;">Level ${format_level(v.xp, true)}</td>
                    </tr>
                `;
                $("#packvictorstable").append(row);
            }
        }
    } else {
        let row = `<tr><td colspan="3" style="text-align: center; font-style: italic; color: #ccc;">No pack victors yet</td></tr>`;
        $("#packvictorstable").append(row);
    }
}

$("#game-select, [id^=diff-], #tower-sort").on("input change", function() {
    if ($(this).attr('id') === 'tower-sort') {
        localStorage.setItem("sclp-tower-sort", $(this).val());
        init_towers();
    } else {
        filter_towers();
    }
});

$("#tower-sort-dir").on("click", function() {
    const dir = $(this).attr("data-dir") === "asc" ? "desc" : "asc";
    $(this).attr("data-dir", dir).html(dir === "desc" ? "↓" : "↑");
    localStorage.setItem("sclp-tower-sort-dir", dir);
    init_towers();
});

$("#checklist-player").on("input", function () {
    filter_towers();
    init_packs();
    localStorage.setItem("sclp-username", $(this).val());
});

$("#player-country").on("change", filter_players);

$("#player-sort").on("change", function() {
    localStorage.setItem("sclp-player-sort", $(this).val());
    init_players();
    filter_players();
});
$("#player-sort").val(localStorage.getItem("sclp-player-sort") || "xp");

$("#player-sort-dir").on("click", function() {
    const dir = $(this).attr("data-dir") === "asc" ? "desc" : "asc";
    $(this).attr("data-dir", dir).html(dir === "desc" ? "↓" : "↑");
    localStorage.setItem("sclp-player-sort-dir", dir);
    init_players();
    filter_players();
});
let stored_player_dir = localStorage.getItem("sclp-player-sort-dir") || "desc";
$("#player-sort-dir").attr("data-dir", stored_player_dir).html(stored_player_dir === "asc" ? "↑" : "↓");

let stored_tower_sort = localStorage.getItem("sclp-tower-sort") || "difficulty";
let stored_tower_dir = localStorage.getItem("sclp-tower-sort-dir");
if (stored_tower_sort.endsWith("-asc")) {
    stored_tower_sort = stored_tower_sort.slice(0, -4);
    stored_tower_dir = stored_tower_dir || "asc";
}
$("#tower-sort").val(stored_tower_sort);
$("#tower-sort-dir").attr("data-dir", stored_tower_dir || "desc").html(stored_tower_dir === "asc" ? "↑" : "↓");

$("#pack-sort").on("change", function() {
    localStorage.setItem("sclp-pack-sort", $(this).val());
    init_packs();
});
$("#pack-sort").val(localStorage.getItem("sclp-pack-sort") || "xp");

$("#pack-sort-dir").on("click", function() {
    const dir = $(this).attr("data-dir") === "asc" ? "desc" : "asc";
    $(this).attr("data-dir", dir).html(dir === "desc" ? "↓" : "↑");
    localStorage.setItem("sclp-pack-sort-dir", dir);
    init_packs();
});
let stored_pack_dir = localStorage.getItem("sclp-pack-sort-dir") || "asc";
$("#pack-sort-dir").attr("data-dir", stored_pack_dir).html(stored_pack_dir === "asc" ? "↑" : "↓");

function format_location(tower, start, end) {
    const places = tower["places"].slice(start, end);
    const game = tower["game"];
    let formatted = "";

    places.forEach((loc, i) => {
        const href = loc[0] === "Place" ? game : game_from_abbr(loc[0]).link;
        const text = loc[1] ? `${loc[0]}, ${loc[1]}` : loc[0];
        formatted += `<a href='${href}' target='_blank'>${text}</a>`;
        if (i < places.length - 1) formatted += " / ";
    });

    return formatted;
}

function is_tower_in_place(places, place) {
    for (let i of places) {
        if (i[0] == place) {
            return true;
        }
    }
    return false;
}

function quality_class(q) {
    if (q === "SS") return "quality-ss";
    if (q === "S+") return "quality-s-plus";
    if (q === "S")  return "quality-s";
    if (q === "S-") return "quality-s-minus";
    return "quality-" + q.replace(/[+\-]$/, "").toLowerCase();
}

function open_tower(id) {
    current_tower_id = id;
    open_page("Towers");
    var tower = tower_lookup[id];
    let diff = difficulty_to_name(tower["difficulty"]);

    $("#towername").html(`(${getAbbr(tower["name"])}) ${tower["name"]}`);
    $("#towerdifficulty").html(`<span class="${diff}">${difficulty_to_range(tower["difficulty"])} ${diff}</span> (${formatNumber(tower["difficulty"] / 100)})`);
    $("#towerlocation").html(format_location(tower, 0, 1));
    $("#otherlocations").html(tower["places"].length > 1 ? `<i>Other Locations: ${format_location(tower, 1, tower["places"].length)}</i>` : "");
    $("#towerrank").html(tower["rank"]);
    $("#towerxp").html(tower["xp"]);
    $("#towervictors").html(victors_cache[id]);
    if (tower.quality) {
        $("#towerquality").html(`Quality: <span class="${quality_class(tower.quality)}">${tower.quality}</span>`);
    } else {
        $("#towerquality").html("");
    }
    
    let tower_packs = packs.filter(pack => pack.towers.map(Number).includes(id));
    if (tower_packs.length > 0) {
        let pack_links = tower_packs.map(pack =>
            `<a href="javascript:void(0)" onclick="open_pack('${pack.id}')">${pack.name}</a>`
        ).join(", ");
        $("#towerpacks").html(`Packs: ${pack_links}`);
    } else {
        $("#towerpacks").html("");
    }
    $("#towerid").html(id);

    const victors = tower_victors_by_tower[id] || [];
    let victorsHtml;
    if (victors.length > 0) {
        victorsHtml = victors.map(username => {
            const player = player_lookup[username];
            return `
                <tr data-name="${username.toLowerCase()}">
                    <td>#${player["rank"]}</td>
                    <td><button class="player-button" onclick='open_player("${username}")'>${get_role(username, true)}</button></td>
                    <td style="text-align: right;">Level ${format_level(player["xp"], true)}</td>
                </tr>
            `;
        }).join("");
    } else {
        victorsHtml = `<tr><td colspan="3" style="text-align: center; font-style: italic; color: #ccc;">No SCLP victors yet</td></tr>`;
    }
    $("#towervictorstable").html(victorsHtml);
}

$("#checklist-player").val(localStorage.getItem("sclp-username") || "");

function format_level(xp, level_only) {
    let current_level = 0;
    let last_xp = 150;
    let total = 0;

    if (xp < 175) {
        if (level_only == true) {
            return "0";
        } else {
            return "0 (" + xp + "/175)";
        }
    }

    while (total <= xp) {
        current_level += 1;
        last_xp = 150 + (25 * (current_level ** 2));
        total += last_xp;
    }

    if (level_only == true) {
        return current_level - 1;
    } else {
        return (current_level - 1) + " (" + (xp - (total - last_xp)) + "/" + (150 + (25 * (current_level ** 2))) + ")";
    }
}

function get_role(x, t=false) {
    const r = role_by_username[x];
    if (r) {
        if (!t) return r;
        return `<span class="${r.toLowerCase().replaceAll(" ", "-")}">${x}</span>`;
    }
    if (t && cool_members.includes(x)) {
        return `<span class="cool">${x}</span>`;
    }
    return t ? x : "";
}

function add_badges(rank, role, comps) {
    let e = document.getElementById("playername");
    if (rank <= 3) {
        e.innerHTML += `<img src='/static/images/badges/top${rank}.png' class="badge">`;
    }

    if (role != "" && !role.includes("Former")) {
        e.innerHTML += `<img src='/static/images/badges/staff.png' class="badge">`;
    }

    let scs = comps.length;
    let sc_levels = [50, 100, 200, 300, 400, 500];
    let sc_badge = "";
    for (let level of sc_levels) {
        if (scs >= level) {
            sc_badge = `<img src='/static/images/badges/${level}.png' class="badge">`;
        }
    }
    e.innerHTML += sc_badge;

    let hardest_diff = get_hardest_tower(comps);
    if (hardest_diff >= 1100) {
        e.innerHTML += `<img src='/static/images/badges/${difficulty_to_name(hardest_diff).toLowerCase()}.png' class="badge">`;
    }
}

let dp = {};
function get_dp(comps, username) {
    dp = {};
    const counts = diff_count_cache[username] || {};
    for (let diff of Object.keys(tier_totals_by_difficulty)) {
        dp[diff] = [counts[diff] || 0, tier_totals_by_difficulty[diff]];
    }
}

function getFlag(x) {
    if (!x) return `<span class="fi-placeholder" title="Unknown"></span>`;
    return `<span class="fi fi-${x.toLowerCase()}" title="${x.toUpperCase()}"></span>`;
}

function open_player(name, rank) {
    var player = player_from_name(name);
    current_player_name = player["username"];
    open_page("Leaderboard");
    let role = get_role(player["username"]);
    let comps = player["completions"];
    let total_xp = player["total_xp"];
    get_dp(comps, name);

    let nationalityFlag = getFlag(player["nationality"]);
    $("#playername").html(name + " " + nationalityFlag);

    $("#playerrole").html("");
    if (role) $("#playerrole").html(`<span class="${role.toLowerCase().replaceAll(" ", "-")}">${role}</span>`);
    $("#playerxp").html(formatNumber(total_xp));
    $("#playerlevel").html(format_level(total_xp));
    let r = rank || player["rank"];
    $("#playerrank").html(`#${r}`);

    let c1 = Object.values(dp).reduce((a,[x])=>a+x,0);
    let c2 = Object.values(dp).reduce((a,[,y])=>a+y,0);
    let row = `
        <th>TOTAL</th>
        <th>${c1}/${c2}</th>
        <th>${+(c1 / c2 * 100).toFixed(2)}%</th>
    `;
    $("#difficulty-progress").html(row);

    for (let d = 8; d < 14; d++) {
        let diff = difficulty_to_name(d * 100);
        row = `
            <tr>
                <td class="${diff}">${diff}</td>
                <td>${dp[diff][0]}/${dp[diff][1]}</td>
                <td>${+(dp[diff][0] / dp[diff][1] * 100).toFixed(2)}%</td>
            </tr>
        `;
        $("#difficulty-progress").append(row);
    }
    
    const completedTowerIds = player_completed_towers_by_player[name] || [];
    const completionsHtml = completedTowerIds.map(id => {
        const tower = tower_lookup[id];
        const diff = tower["difficulty"];
        return `
            <tr>
                <td class="${difficulty_to_name(diff)}">#${tower["rank"]}</td>
                <td><button class="tower-button" onclick="open_tower(${tower["id"]})">${tower["name"]}</button></td>
                <td><span class="${difficulty_to_name(diff)}">${formatNumber(diff / 100)}</span></td>
            </tr>
        `;
    }).join("");
    $("#playercompletions").html(completionsHtml);

    $("#playerpacks").html("");
    let completed_packs = packs.filter(pack => pack.towers.every(id => comps.includes(parseInt(id))));
    if (completed_packs.length) {
        completed_packs.forEach(pack => {
            $("#playerpacks").append(`<p>${pack.name} (${formatNumber(pack.xp)} Bonus XP)</p>`);
        });
    } else {
        $("#playerpacks").html("<p style='color: #ccc; font-style: italic;'>No packs completed</p>");
    }

    add_badges(player["rank"], role, comps);
}

function game_from_abbr(abbr) {
    for (let gm of games) {
        if (abbr == gm["abbr"]) {
            return gm;
        }
    }
    return false;
}

$("#game-select").html("<option value=''>All</option><option value='Place'>Place</option>");
for (let game of games) {
    $("#game-select").append(`<option value='${game["abbr"]}'>${game["abbr"]}</option>`);
}

window.addEventListener('popstate', function(event) {
    const pop_params = new URLSearchParams(window.location.search);
    if (pop_params.get("t")) {
        open_tower(parseInt(pop_params.get("t")));
    } else if (pop_params.get("u")) {
        open_player(pop_params.get("u"));
    } else if (pop_params.get("pk")) {
        open_pack(pop_params.get("pk"));
    } else if (pop_params.get("page")) {
        const page_name = pages.find(p => p.toLowerCase() === pop_params.get("page").toLowerCase());
        if (page_name) open_page(page_name);
    } else if (event.state && event.state.page) {
        open_page(event.state.page);
    }
});

precompute_caches();
init_towers();
init_players();
init_packs();

if (typeof scotw_ready !== "undefined" && scotw_ready && typeof current_scotw !== "undefined") {
    init_scotw();
}

const countries = [...new Set(completions.map(p => p.nationality).filter(Boolean))].sort();
for (let code of countries) {
    $("#player-country").append(`<option value="${code}">${code.toUpperCase()}</option>`);
}

const url = window.location.search;
const params = new URLSearchParams(url);

open_player(completions[0]["username"]);
open_pack(packs[0]["id"]);
open_tower(towers[0]["id"]);

if (params.get("t")) {
    open_tower(parseInt(params.get("t")));
} else if (params.get("u")) {
    open_player(params.get("u"));
} else if (params.get("pk")) {
    open_pack(params.get("pk"));
} else if (params.get("page")) {
    const page_name = pages.find(p => p.toLowerCase() === params.get("page").toLowerCase());
    if (page_name) open_page(page_name);
} else {
    open_page("Home");
}