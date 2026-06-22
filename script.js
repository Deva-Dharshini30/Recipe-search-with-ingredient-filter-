const searchBtn = document.getElementById('search-btn');
const ingredientInput = document.getElementById('ingredient-input');
const recipeGrid = document.getElementById('recipe-grid');
const statusDiv = document.getElementById('status');
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const closeModalBtn = document.getElementById('close-modal');
const chipsContainer = document.getElementById('chips');

// Common ingredients familiar in Indian kitchens — shown as quick-pick chips
const indianIngredients = [
  'Chicken', 'Potato', 'Onion', 'Tomato', 'Egg', 'Rice', 'Paneer', 'Cheese',
  'Garlic', 'Ginger', 'Spinach', 'Lentils', 'Chickpeas', 'Peas', 'Cauliflower',
  'Yogurt', 'Mutton', 'Lamb', 'Fish', 'Prawns', 'Cumin', 'Turmeric',
  'Coriander', 'Chilli', 'Butter', 'Milk', 'Carrot', 'Cabbage'
];

// Always show at least this many dishes per search
const MIN_RESULTS = 8;

// Full ingredient list pulled live from TheMealDB so we can match
// anything the user types to a name the API actually recognises.
let masterIngredientList = [];

async function loadMasterIngredientList() {
  try {
    const res = await fetch('https://www.themealdb.com/api/json/v1/1/list.php?i=list');
    const data = await res.json();
    if (data.meals) {
      masterIngredientList = data.meals.map(m => m.strIngredient);
    }
  } catch (err) {
    console.error('Could not load ingredient list', err);
  }
}

// Finds the closest real ingredient name the API will accept
function resolveIngredient(typed) {
  const query = typed.trim().toLowerCase();
  if (!query) return null;

  // 1. Exact match
  let match = masterIngredientList.find(i => i.toLowerCase() === query);
  if (match) return match;

  // 2. Singular/plural tolerant exact match (potato vs potatoes)
  match = masterIngredientList.find(i => {
    const name = i.toLowerCase();
    return name === query + 's' || name === query.slice(0, -1) || name + 's' === query;
  });
  if (match) return match;

  // 3. Starts-with match (chick -> chicken)
  match = masterIngredientList.find(i => i.toLowerCase().startsWith(query));
  if (match) return match;

  // 4. Contains match (anywhere in the name)
  match = masterIngredientList.find(i => i.toLowerCase().includes(query));
  if (match) return match;

  // 5. Reverse contains (typed word is longer / contains the ingredient name)
  match = masterIngredientList.find(i => query.includes(i.toLowerCase()));
  if (match) return match;

  return null;
}

// Tops up a short result list with extra real recipes pulled at random,
// so the grid always shows a healthy number of dishes to browse.
async function padWithExtraMeals(existingMeals, countNeeded) {
  const result = [...existingMeals];
  const seenIds = new Set(existingMeals.map(m => m.idMeal));
  let attempts = 0;

  while (result.length < existingMeals.length + countNeeded && attempts < countNeeded * 4) {
    attempts++;
    try {
      const res = await fetch('https://www.themealdb.com/api/json/v1/1/random.php');
      const data = await res.json();
      const meal = data.meals && data.meals[0];
      if (meal && !seenIds.has(meal.idMeal)) {
        seenIds.add(meal.idMeal);
        result.push(meal);
      }
    } catch (err) {
      console.error('Padding fetch failed', err);
      break;
    }
  }
  return result;
}

function renderChips() {
  chipsContainer.innerHTML = '';
  indianIngredients.forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = name;
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ingredientInput.value = name;
      searchRecipes();
    });
    chipsContainer.appendChild(chip);
  });
}

ingredientInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') searchRecipes();
});
searchBtn.addEventListener('click', searchRecipes);
closeModalBtn.addEventListener('click', () => modalOverlay.style.display = 'none');
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.style.display = 'none';
});

async function searchRecipes() {
  const typed = ingredientInput.value.trim();
  recipeGrid.innerHTML = '';

  if (!typed) {
    statusDiv.textContent = 'Type an ingredient or tap one of the suggestions below.';
    return;
  }

  statusDiv.innerHTML = '<div class="spinner"></div>';

  // Make sure the master list has loaded before resolving
  if (masterIngredientList.length === 0) {
    await loadMasterIngredientList();
  }

  const resolved = resolveIngredient(typed) || typed;

  try {
    const url = `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(resolved)}`;
    const response = await fetch(url);
    const data = await response.json();

    let meals = data.meals || [];

    if (meals.length === 0) {
      statusDiv.innerHTML = '';
      recipeGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <span class="icon">🍛</span>
          No recipes found for "${typed}".<br>Try one of the suggestions below.
        </div>`;
      return;
    }

    const niceName = resolved.toLowerCase() === typed.toLowerCase() ? typed : resolved;
    const directCount = meals.length;

    // Guarantee at least MIN_RESULTS dishes on screen. If the ingredient
    // filter alone doesn't return enough, pad the grid with extra real
    // recipes pulled from the API so the user always has plenty to browse.
    if (meals.length < MIN_RESULTS) {
      const padded = await padWithExtraMeals(meals, MIN_RESULTS - meals.length);
      meals = padded;
    }

    statusDiv.textContent = directCount >= MIN_RESULTS
      ? `Found ${directCount} recipe(s) with "${niceName}"`
      : `Found ${directCount} recipe(s) with "${niceName}" — showing ${meals.length} dishes total, including similar picks`;

    displayRecipes(meals, directCount);

  } catch (error) {
    statusDiv.textContent = 'Something went wrong. Check your internet connection.';
    console.error(error);
  }
}

function displayRecipes(meals, directCount = meals.length) {
  recipeGrid.innerHTML = '';
  meals.forEach((meal, index) => {
    const isExtra = index >= directCount;
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.style.animationDelay = `${Math.min(index * 0.04, 0.4)}s`;
    card.innerHTML = `
      <div class="img-wrap">
        <span class="tag${isExtra ? ' suggested' : ''}">${isExtra ? 'You might also like' : 'Recipe'}</span>
        <img src="${meal.strMealThumb}" alt="${meal.strMeal}" loading="lazy">
      </div>
      <div class="body">
        <h3>${meal.strMeal}</h3>
        <span class="view-link">View recipe →</span>
      </div>
    `;
    card.addEventListener('click', () => showRecipeDetails(meal.idMeal));
    recipeGrid.appendChild(card);
  });
}

async function showRecipeDetails(id) {
  modalContent.innerHTML = '<div class="spinner" style="margin:60px auto;"></div>';
  modalOverlay.style.display = 'flex';

  try {
    const url = `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`;
    const response = await fetch(url);
    const data = await response.json();
    const meal = data.meals[0];

    let ingredientsHTML = '';
    for (let i = 1; i <= 20; i++) {
      const ing = meal[`strIngredient${i}`];
      const measure = meal[`strMeasure${i}`];
      if (ing && ing.trim()) {
        ingredientsHTML += `<li>${measure ? measure.trim() : ''} ${ing.trim()}</li>`;
      }
    }

    modalContent.innerHTML = `
      <div class="modal-img-wrap">
        <img src="${meal.strMealThumb}" alt="${meal.strMeal}">
      </div>
      <div class="modal-body">
        <h2>${meal.strMeal}</h2>
        <div class="modal-meta">
          <span>${meal.strCategory}</span>
          <span>${meal.strArea} cuisine</span>
        </div>
        ${meal.strYoutube ? `<a href="${meal.strYoutube}" target="_blank" rel="noopener" class="youtube-btn">▶ Watch recipe video on YouTube</a>` : ''}
        <h4>Ingredients</h4>
        <ul>${ingredientsHTML}</ul>
        <h4>Instructions</h4>
        <p class="instructions">${meal.strInstructions}</p>
      </div>
    `;
  } catch (error) {
    modalContent.innerHTML = '<p style="padding:30px;">Could not load recipe details.</p>';
    console.error(error);
  }
}

// Init
renderChips();
loadMasterIngredientList();