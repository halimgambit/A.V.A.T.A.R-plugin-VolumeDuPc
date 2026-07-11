const LAST_VOLUME = new Map();

export async function init() {
    await Avatar.lang.addPluginPak('VolumeDuPc'); 
}

export async function action(data, callback) {
    try {
        const Locale = await Avatar.lang.getPak('VolumeDuPc', data.language);

        const tblActions = {
            setVolume: () => setVolume(data, data.client, data.toClient || data.client, Locale),
            volumeUp: () => changeVolume(data.client, data.toClient || data.client, 10, Locale),
            volumeDown: () => changeVolume(data.client, data.toClient || data.client, -10, Locale),
            mute: () => mute(data.client, data.toClient || data.client, Locale),
            unmute: () => unmute(data.client, data.toClient || data.client, Locale)
        };

        info("VolumeDuPc", data.action.command, "from:", data.client, "to:", data.toClient || data.client);

        if (tblActions[data.action.command]) {
            
            await tblActions[data.action.command]();
        }
    } catch (err) {
        if (data.client) Avatar.Speech.end(data.client);
        error("Erreur VolumeDuPc:", err.message || err);
    }

    callback();
}

const setVolume = async (data, client, toClient, Locale) => {
    const sentence = (data.rawSentence || data.action.sentence || "").toLowerCase();
    const match = sentence.match(/(\d{1,3})/);

    if (!match) {
        Avatar.speak(Locale.get('speech.noValue'), client);
        return;
    }

    let volume = Math.max(0, Math.min(100, parseInt(match[1], 10)));
    
    await executeOsVolume(toClient, { action: "set", value: volume });
    LAST_VOLUME.set(toClient, volume);
    Avatar.speak(Locale.get('speech.setVolume', volume), client);
};

const changeVolume = async (client, toClient, delta, Locale) => {
    let current = LAST_VOLUME.get(toClient) ?? 40;
    let volume = Math.max(0, Math.min(100, current + delta));
    const ttsKey = delta > 0 ? 'speech.volumeUp' : 'speech.volumeDown';
    
    await executeOsVolume(toClient, { action: "set", value: volume });
    LAST_VOLUME.set(toClient, volume);
    Avatar.speak(Locale.get(ttsKey), client);
};

const mute = async (client, toClient, Locale) => {
    await executeOsVolume(toClient, { action: "mute" });
    Avatar.speak(Locale.get('speech.mute'), client);
};

const unmute = async (client, toClient, Locale) => {
    let volume = LAST_VOLUME.get(toClient) ?? 40;
    await executeOsVolume(toClient, { action: "unmute", value: volume });
    Avatar.speak(Locale.get('speech.unmute', volume), client);
};

const executeOsVolume = (toClient, params) => {
    return new Promise((resolve) => {
        const clientInfos = Avatar.Socket.getClient(toClient);
        const osType = (clientInfos && clientInfos.os) ? clientInfos.os.toLowerCase() : 'windows';
        let cmd = "";

        if (osType.includes('win')) {
            if (params.action === "set") {
                const stepsUp = Math.round(params.value / 2);
                cmd = `powershell -Command "$w=New-Object -ComObject WScript.Shell; for($i=0; $i -lt 50; $i++) { $w.SendKeys([char]0xAE) }; for($i=0; $i -lt ${stepsUp}; $i++) { $w.SendKeys([char]0xAF) }"`;
            } else if (params.action === "mute" || params.action === "unmute") {
                cmd = `powershell -Command "$w=New-Object -ComObject WScript.Shell; $w.SendKeys([char]0xAD)"`;
            }
        } 
        else if (osType.includes('lin')) {
            if (params.action === "set") {
                cmd = `amixer set Master ${params.value}%`;
            } else if (params.action === "mute") {
                cmd = `amixer set Master mute`;
            } else if (params.action === "unmute") {
                cmd = `amixer set Master unmute`;
            }
        }
        else if (osType.includes('mac')) {
            if (params.action === "set") {
                const macVol = Math.round(params.value * 7 / 100);
                cmd = `osascript -e "set volume ${macVol}"`;
            } else if (params.action === "mute") {
                cmd = `osascript -e "set volume with output muted"`;
            } else if (params.action === "unmute") {
                cmd = `osascript -e "set volume without output muted"`;
            }
        }

        if (cmd) {
            Avatar.runApp(cmd, toClient, () => resolve());
        } else {
            resolve();
        }
    });
};