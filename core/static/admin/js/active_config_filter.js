(function() {
  'use strict';

  // Listen for changes on the product dropdown
  const productSelect = document.getElementById('id_product');
  const modelSelect = document.getElementById('id_model');

  if (!productSelect || !modelSelect) {
    return; // Exit if selects not found
  }

  /**
   * Fetch compatible models for a given product
   */
  async function updateModelOptions(productId) {
    if (!productId) {
      modelSelect.innerHTML = '<option value="">---------</option>';
      return;
    }

    try {
      // Construct API URL to fetch compatible models
      const apiUrl = `/api/ai-models/?compatible_components=${productId}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      // Save currently selected model ID
      const currentModelId = modelSelect.value;

      // Clear existing options
      modelSelect.innerHTML = '<option value="">---------</option>';

      // Add new compatible models
      if (Array.isArray(data)) {
        // If response is array (paginated or not)
        const models = data;
        if (models.length === 0) {
          modelSelect.innerHTML = '<option disabled>No compatible models available</option>';
          return;
        }

        models.forEach((model) => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = `${model.name} (${model.version})`;
          if (model.id === parseInt(currentModelId)) {
            option.selected = true;
          }
          modelSelect.appendChild(option);
        });
      } else if (data.results) {
        // If response has results property (DRF pagination)
        const models = data.results;
        if (models.length === 0) {
          modelSelect.innerHTML = '<option disabled>No compatible models available</option>';
          return;
        }

        models.forEach((model) => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = `${model.name} (${model.version})`;
          if (model.id === parseInt(currentModelId)) {
            option.selected = true;
          }
          modelSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error fetching compatible models:', error);
      modelSelect.innerHTML = '<option value="">Error loading models</option>';
    }
  }

  // Initial load
  if (productSelect.value) {
    updateModelOptions(productSelect.value);
  }

  // Listen for product changes
  productSelect.addEventListener('change', (event) => {
    updateModelOptions(event.target.value);
  });
})();
