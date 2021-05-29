const { parentPort } = require('worker_threads');
const got = require('got');
const { parse } = require('node-html-parser');

async function doFetch(meta) {
    const ts = Math.floor(Date.now() / 1000);

    console.time('fetching');
    const res = await got(`https://dstserverlist.appspot.com/ajax/list?${ts}`, {
        searchParams: {
            [meta.CSRF_KEY]: meta.CSRF_VALUE
        },
        headers: {
            'Cookie': meta.COOKIE,
            'Referer': 'https://dstserverlist.appspot.com/',
            'x-requested-with': 'XMLHttpRequest'
        }
    }).json();
    console.timeEnd('fetching');

    console.time('parsing');
    const document = parse(res.result);
    console.timeEnd('parsing');

    console.time('deserializing');
    const servers = document.querySelectorAll('.list > tr')
        .map(row => {
            const firstData = row.querySelector('td');

            const id = row.getAttribute('id');

            // Get name, no error checking
            const name = firstData.querySelector('.fnm').text;

            // Get country name and code
            const flag = firstData.querySelector('.flag-icon');
            const country = flag.getAttribute('data-tooltip');
            const countryCode = flag.getAttribute('class').split(' ')
                .pop()
                .split('-')
                .pop();

            // Get platform: Steam, WeGame, PS4, more?
            const platform = row.querySelector('.fpf').text;

            // Get player count, fpy is also used to check for password
            const fpy = row.querySelector('.fpy');
            const playersText = fpy.firstChild.text;
            const match = playersText.match(/(\d+)\/(\d+)/);
            const playerCount = Number(match[1]);
            const maxPlayers = Number(match[2]);

            // Get gamemode (normal/endless) and current season
            const mode = row.querySelector('.fmd').text;
            const season = row.querySelector('.fss').text;

            // Get some flags: modded, outdated, pvp, official, passworded
            const icons = firstData.querySelectorAll('.mico');
            const modded = icons.some(icon => icon.text === 'settings');
            const outdated = icons.some(icon => icon.text === 'warning');
            const pvp = icons.some(icon => icon.text === 'restaurant_menu');
            const official = icons.some(icon => icon.text === 'check_circle');

            // Player count can have a lock icon if it's passworded
            const passworded = fpy.querySelector('.mico') !== null;

            return {
                id,
                country,
                countryCode,
                platform,
                playerCount,
                maxPlayers,
                name,
                mode,
                season,
                modded,
                outdated,
                pvp,
                official,
                passworded
            };
        });
    console.timeEnd('deserializing');

    parentPort.postMessage(servers);
}

parentPort.on('message', data => {
    switch (data.type) {
        case 'fetch':
            doFetch(data.payload.meta);
            break;
    }
});
