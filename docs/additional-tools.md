# Дополнительные инструменты

Внешние утилиты, полезные для разработки и передачи контекста LLM. Не входят в `npm run verify:ci`.

---

## code2prompt

**Репозиторий:** [mufeedvh/code2prompt](https://github.com/mufeedvh/code2prompt)

CLI на Rust: собирает кодовую базу в один промпт для LLM — дерево файлов, содержимое исходников, подсчёт токенов. Учитывает `.gitignore`, поддерживает include/exclude glob, шаблоны Handlebars, git diff.

**Зачем TFG Planner:** разовый снимок репозитория для чата вне Cursor (ChatGPT, Claude, другой агент) или аудит «всего кода» без ручного копирования файлов. Дополняет [agent-tooling-catalog.md](agent-tooling-catalog.md) (Repomix, `@codebase` в Cursor).

### Установка

| Способ | Команда |
|--------|---------|
| Бинарник (Windows) | [Releases v4.2.0+](https://github.com/mufeedvh/code2prompt/releases) → `code2prompt-x86_64-pc-windows-msvc.exe` |
| Cargo | `cargo install code2prompt` |
| Homebrew | `brew install code2prompt` |

### Снимок этого репозитория

Выходной файл в корне проекта: **`code2prompt.txt`** (генерируется локально, в git не коммитится).

Повторная генерация (из корня репо):

```powershell
.tools\code2prompt.exe . --output-file code2prompt.txt -q `
  -e "public/data/packs/**/recipes/**" `
  -e "tools/parser/snapshots/**" `
  -e "tools/parser/substrate-dumps/**" `
  -e ".tools/**" `
  -e "dist/**" `
  -e "node_modules/**" `
  -e "*.tfgp" `
  -e "package-lock.json"
```

Исключения совпадают с [`.cursorignore`](../.cursorignore): тяжёлые pack shards, кэш парсера, сборка, пользовательские `.tfgp` в корне.

Бинарник для Windows хранится в `.tools/code2prompt.exe` (тоже не в git).

### Полезные флаги

```bash
code2prompt . --output-file code2prompt.txt   # сохранить в файл
code2prompt . -c                            # в буфер обмена
code2prompt . --token-format format         # число токенов в конце
code2prompt . -d                            # включить git diff
code2prompt . --tui                         # интерактивный TUI
```

Документация: [code2prompt.dev](https://code2prompt.dev)
