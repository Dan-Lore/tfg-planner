// priority: 0
"use strict";

function registerCrafting(event) {
  event.shapeless(Item.of('gtceu:facade_cover', 8), ['3x #forge:plates/iron', "#tfg:whitelisted/facades"])
    .modifyResult((craftingGrid, result) => {
      let blockID = craftingGrid.find(Ingredient.of("#tfg:whitelisted/facades")).id
      result.nbt = `{Facade: {Count:1b,id:'${blockID}'}}`
      return result;
    }).id('gtceu:facade_cover');
}
