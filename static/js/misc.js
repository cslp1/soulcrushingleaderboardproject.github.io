function tower_from_id(id) {
    return tower_lookup[id];
}

function player_from_name(name) {
    return player_lookup[name] || false;
}

function get_victors(id) {
    return victors_cache[id] || 0;
}

function get_hardest_tower(x) {
    if (typeof x === 'string') {
        return hardest_cache[x] || 0;
    }
    
    let highest_diff = 0;
    for (let id of x) {
        let tower = tower_lookup[id];
        if (tower && tower.difficulty > highest_diff) {
            highest_diff = tower.difficulty;
        }
    }
    return highest_diff;
}

function get_pack_victors(pack_id) {
    return pack_victors_cache[pack_id] || [];
}

function toTitleCase(str) {
    return str.replace(
      /\w\S*/g,
      text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
}

let credits = {};
for (let entry of rawcredits) {
    if (entry.role in credits) {
        credits[entry.role].push(entry.username);
    } else {
        credits[entry.role] = [entry.username];
    }
}

for (let [role, users] of Object.entries(credits)) {
    $("#credits").append(`<h3><div class="${role.toLowerCase().replaceAll(" ", "-")}">[${toTitleCase(role)}]</div>${users.join(", ")}</h3>`);
}

function formatNumber(num) {
    let d = num < 20 ? 2 : 0;
    return new Intl.NumberFormat("en-US", {minimumFractionDigits: d}).format(num);
}

function getAbbr(x) {
    x = x.replace("CumpleAnos", "Cumple Anos").replace(" Facility", "").replace("GBJ Edition", "G B J").replace(/\.([^\s])/g, ' $1').split(" (")[0];
    let main = x.replace(":", " :").replaceAll('-', ' ').split(' ').map(word => {
        if (!word) return '';
        if (/^\d+$/.test(word)) return word[0];
        let letter = word[0];
        let digit = word.match(/\d/);
        return (letter === letter.toLowerCase() ? letter : letter.toUpperCase()) + (digit ? digit[0] : '');
    }).join('');
    return main;
}

function difficulty_to_name(d) {
    if (d < 200) return "Easy";
    if (d < 300) return "Medium";
    if (d < 400) return "Hard";
    if (d < 500) return "Difficult";
    if (d < 600) return "Challenging";
    if (d < 700) return "Intense";
    if (d < 800) return "Remorseless";
    return "Nil";
}

function difficulty_to_range(d) {
    d %= 100;
    if (d == 0) return "Baseline";
    if (d == 99) return "Skyline";
    if (d < 12) return "Bottom";
    if (d < 23) return "Bottom-Low";
    if (d < 34) return "Low";
    if (d < 45) return "Low-Mid";
    if (d < 56) return "Mid";
    if (d < 67) return "Mid-High";
    if (d < 78) return "High";
    if (d < 89) return "High-Peak";
    return "Peak";
}

function calculate_bonus_xp(completions) {
    let bonus_xp = 0;
    let completed_packs = packs.filter(pack => pack.towers.every(id => completions.includes(parseInt(id))));
    completed_packs.forEach(pack => {
        let tower_xp = pack.towers.map(id => towers.find(t => t.id === parseInt(id))?.xp || 0);
        let pack_bonus = pack.towers.length ? tower_xp.reduce((sum, xp) => sum + xp, 0) / pack.towers.length : 0;
        bonus_xp += pack_bonus;
    });
    return bonus_xp;
}

function scaleLayout() {
    const designedWidth = 800;
    const screenWidth = window.innerWidth;
    const scale = Math.min(screenWidth / designedWidth, 1);
    const main = document.getElementById('main');

    if (screenWidth < designedWidth) {
        main.style.transform = `scale(${scale})`;
        main.style.transformOrigin = 'top left';
        main.style.width = `${designedWidth}px`;
        main.style.height = `${100 / scale}%`;
    } else {
        main.style.transform = '';
        main.style.width = '';
        main.style.height = '';
    }
}

window.addEventListener('resize', scaleLayout);
scaleLayout();

let inputs = document.querySelectorAll("input");
inputs.forEach(input => {
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", false);
});

let pages = ["Home", "Towers", "Leaderboard", "Packs"];
for (let page of pages) {
    $("#links").append(`<button class="seamless-button" onclick="open_page('${page}')">${page}</button>`);
}

function open_page(page_name) {
    for (let page of pages) {
        $(`#${page.toLowerCase()}-page`).hide();
    }
    $(`#${page_name.toLowerCase()}-page`).css("display", "");
}
open_page("Home");

document.getElementById('discord').addEventListener('click', function() {
    window.open('https://discord.gg/t9crQndHyn', '_blank');
});
