// priority: 0
"use strict";

/** @param {TagEvent.Item} event */
function registerTags(event) {
  global.GTCEU_DISABLED_ITEMS.forEach((item) => {
    event.removeAllTagsFrom(item);
    event.add("c:hidden_from_recipe_viewers", item);
  });
}
