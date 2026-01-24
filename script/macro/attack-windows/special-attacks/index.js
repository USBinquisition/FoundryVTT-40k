import { buildMacroOwnership, resolveActorContext } from "../common.js";

const JOURNAL_NAME = "Special Attacks";

/**
 *
 */
async function ensureJournal() {
    let journal = game.journal?.find(entry => entry.name === JOURNAL_NAME);
    if (journal) return journal;
    journal = await JournalEntry.create({
        name: JOURNAL_NAME,
        ownership: buildMacroOwnership()
    }, { renderSheet: false });
    return journal;
}

/**
 *
 * @param page
 */
function extractScriptFromPage(page) {
    if (!page) return "";
    return page.text?.content ?? "";
}

/**
 *
 * @param pages
 */
function buildDialogContent(pages) {
    const options = pages.map(page => `<option value="${page.id}">${page.name}</option>`).join("");
    return `
    <form class="dh-special-attack">
        <div class="form-group">
            <label>Saved Attacks</label>
            <select name="pageId">
                <option value="">-- New Attack --</option>
                ${options}
            </select>
        </div>
        <div class="form-group">
            <label>Attack Name</label>
            <input type="text" name="attackName" />
        </div>
        <div class="form-group">
            <label>Attack Script</label>
            <textarea name="attackScript" rows="10" placeholder="Write a macro script here..."></textarea>
        </div>
        <div class="form-group">
            <label><input type="checkbox" name="saveToJournal" /> Save/Update in journal</label>
        </div>
    </form>`;
}

/**
 *
 * @param journal
 * @param name
 * @param script
 * @param existingPageId
 */
async function upsertJournalPage(journal, name, script, existingPageId = "") {
    const pages = journal.pages ?? [];
    const existing = existingPageId ? pages.get(existingPageId) : pages.find(page => page.name === name);
    if (existing) {
        await existing.update({ name, "text.content": script });
        return existing;
    }
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
        name,
        type: "text",
        text: { content: script }
    }]);
    return created?.[0] ?? null;
}

/**
 *
 * @param script
 * @param actor
 */
async function executeScript(script, actor) {
    if (!script.trim()) {
        ui.notifications.warn("No script provided for special attack.");
        return;
    }
    try {
        const fn = new Function("actor", "token", script);
        const token = actor?.getActiveTokens?.(true, true)?.[0] ?? null;
        await fn(actor, token);
    } catch(error) {
        console.error(error);
        ui.notifications.error(`Special attack failed: ${error.message}`);
    }
}

/**
 *
 */
export async function runSpecialAttackDialog() {
    const { actor } = resolveActorContext();
    if (!actor) {
        ui.notifications.warn("No actor available for special attacks.");
        return;
    }

    const journal = await ensureJournal();
    const pages = journal.pages?.contents ?? [];

    const dialogResult = await new Promise(resolve => {
        const content = buildDialogContent(pages);
        new Dialog({
            title: "Other Special Attack",
            content,
            buttons: {
                run: {
                    label: "Run Attack",
                    callback: html => {
                        const pageId = html.find("[name='pageId']").val();
                        const attackName = html.find("[name='attackName']").val();
                        const attackScript = html.find("[name='attackScript']").val();
                        const saveToJournal = html.find("[name='saveToJournal']").is(":checked");
                        resolve({ pageId, attackName, attackScript, saveToJournal });
                    }
                },
                cancel: {
                    label: "Cancel",
                    callback: () => resolve(null)
                }
            },
            default: "run",
            render: html => {
                html.find("[name='pageId']").on("change", ev => {
                    const pageId = ev.currentTarget.value;
                    const page = pages.find(entry => entry.id === pageId);
                    if (!page) return;
                    html.find("[name='attackName']").val(page.name);
                    html.find("[name='attackScript']").val(extractScriptFromPage(page));
                });
            }
        }).render(true);
    });

    if (!dialogResult) return;

    const attackName = dialogResult.attackName?.trim() || (pages.find(page => page.id === dialogResult.pageId)?.name ?? "Special Attack");
    const script = dialogResult.attackScript?.trim() || extractScriptFromPage(pages.find(page => page.id === dialogResult.pageId));

    let savedPage = null;
    if (dialogResult.saveToJournal && attackName) {
        savedPage = await upsertJournalPage(journal, attackName, script, dialogResult.pageId);
        ui.notifications.info(savedPage ? `Saved special attack: ${attackName}` : "Unable to save special attack.");
    }

    await executeScript(script, actor);
}
