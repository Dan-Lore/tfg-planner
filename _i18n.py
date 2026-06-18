from pathlib import Path

# i18n
i18n = Path("src/i18n/index.ts")
t = i18n.read_text(encoding="utf-8")
t = t.replace("        overclock: 'OC',", "        overclock: 'Разгон',\n        machinesMeta: 'Машин x{{count}}',\n        overclockMeta: 'Разгон {{value}}',")
t = t.replace("        overclock: 'OC',", "        overclock: 'Overclock',\n        machinesMeta: 'Machines x{{count}}',\n        overclockMeta: 'Overclock {{value}}',", 1)
# second replace for en - need careful
lines = t.splitlines()
out = []
seen_en_oc = False
for line in lines:
    out.append(line)
    if not seen_en_oc and "        overclock: 'OC'," in line and "machineCount: 'Machines'" in "\n".join(out[-5:]):
        pass
