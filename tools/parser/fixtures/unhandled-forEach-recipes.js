// priority: 0
"use strict";

function registerCircuits(event) {
  global.ADD_CIRCUIT.forEach(item => {
    addCircuitToRecipe(event, item.recipeId, item.circuitNumber);
  });
}
