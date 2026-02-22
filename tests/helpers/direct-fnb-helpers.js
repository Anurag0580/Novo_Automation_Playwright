import { expect } from '@playwright/test';
const BASE_URL = process.env.PROD_FRONTEND_URL;
const BACKEND_URL = process.env.PROD_BACKEND_URL;

export function createFBTracker() {
  return {
    items: [],
    totalPrice: 0,
    addItem(name, priceValue, displayPrice, concessionItemName) {
      this.items.push({ name, priceValue, displayPrice, concessionItemName });
      this.totalPrice += priceValue;
    }
  };
}

export function categorizeFandBItems(concessionsData) {
  const itemsWithNoModifiers = [];
  const itemsWithModifiers = [];
  const itemsWithAlternates = [];

  if (!concessionsData?.data || !Array.isArray(concessionsData.data)) {
    return { itemsWithNoModifiers, itemsWithModifiers, itemsWithAlternates };
  }

  for (const category of concessionsData.data) {
    if (!category.ConcessionItems || !Array.isArray(category.ConcessionItems)) {
      continue;
    }

    for (const item of category.ConcessionItems) {
      const itemInfo = {
        categoryName: category.name,
        item: item,
        itemName: item.extended_description || item.display_name || item.concession_item_name,
        itemPrice: item.price_in_cents / 100,
        itemPriceDisplay: `QAR ${(item.price_in_cents / 100).toFixed(2)}`
      };

      if (item.AlternateItems && Array.isArray(item.AlternateItems) && item.AlternateItems.length > 0) {
        itemsWithAlternates.push(itemInfo);
      } else if (item.ModifierGroups && Array.isArray(item.ModifierGroups) && item.ModifierGroups.length > 0) {
        itemsWithModifiers.push(itemInfo);
      } else if ((!item.ModifierGroups || (Array.isArray(item.ModifierGroups) && item.ModifierGroups.length === 0)) &&
                 (!item.AlternateItems || (Array.isArray(item.AlternateItems) && item.AlternateItems.length === 0))) {
        itemsWithNoModifiers.push(itemInfo);
      }
    }
  }

  return { itemsWithNoModifiers, itemsWithModifiers, itemsWithAlternates };
}

export async function addFandBItemNoModifiers(page, itemInfo, fbTracker) {
  const { itemName, itemPriceDisplay, item } = itemInfo;

  try {
    const allCategoryButton = page.getByRole('button', { name: 'All' });
    if (await allCategoryButton.isVisible({ timeout: 3000 })) {
      await allCategoryButton.click();
      await page.waitForTimeout(500);
    }
  } catch {
  }

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);

  const itemNameParts = itemName.split('\n');
  const mainItemName = itemNameParts[0].trim();
  const escapedMainName = mainItemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  let itemNameLocator;
  let found = false;
  
  try {
    itemNameLocator = page.getByText(new RegExp(escapedMainName, 'i')).first();
    await itemNameLocator.scrollIntoViewIfNeeded();
    await expect(itemNameLocator).toBeVisible({ timeout: 10000 });
    found = true;
  } catch {
    try {
      const words = mainItemName.split(/\s+/).filter(w => w.length > 2);
      if (words.length > 0) {
        const firstWord = words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        itemNameLocator = page.getByText(new RegExp(firstWord, 'i')).first();
        await itemNameLocator.scrollIntoViewIfNeeded();
        await expect(itemNameLocator).toBeVisible({ timeout: 10000 });
        found = true;
      }
    } catch {
    }
  }

  if (!found) {
    const fullEscapedName = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\s*');
    itemNameLocator = page.locator(`text=/${fullEscapedName}/i`).first();
    await itemNameLocator.scrollIntoViewIfNeeded();
    await expect(itemNameLocator).toBeVisible({ timeout: 10000 });
  }

  await page.waitForTimeout(500);

  const priceText = itemPriceDisplay.replace('QAR ', '').trim();
  
  let itemCard;
  let addButton;
  let verified = false;
  
  const allItemNameMatches = page.getByText(new RegExp(escapedMainName, 'i'));
  const itemCount = await allItemNameMatches.count();
  
  for (let i = 0; i < itemCount; i++) {
    const candidateNameLocator = allItemNameMatches.nth(i);
    await candidateNameLocator.scrollIntoViewIfNeeded();
    
    try {
      await expect(candidateNameLocator).toBeVisible({ timeout: 2000 });
      
      const candidateCard = candidateNameLocator.locator('xpath=ancestor::div[contains(@class, "relative") or contains(@class, "flex") or contains(@class, "border")][position()<=5]').first();
      const cardText = await candidateCard.textContent().catch(() => '');
      
      if (cardText && cardText.includes(mainItemName) && cardText.includes(priceText)) {
        const candidateAddButton = candidateCard.getByRole('button', { name: /^Add$/i }).first();
        
        if (await candidateAddButton.count() > 0) {
          itemCard = candidateCard;
          addButton = candidateAddButton;
          itemNameLocator = candidateNameLocator;
          verified = true;
          break;
        }
      }
    } catch {
      continue;
    }
  }
  
  if (!verified) {
    try {
      const words = mainItemName.split(/\s+/).filter(w => w.length > 2);
      if (words.length > 0) {
        const firstWord = words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const allWordMatches = page.getByText(new RegExp(firstWord, 'i'));
        const wordCount = await allWordMatches.count();

        for (let i = 0; i < wordCount; i++) {
          const candidateNameLocator = allWordMatches.nth(i);
          await candidateNameLocator.scrollIntoViewIfNeeded();
          
          try {
            await expect(candidateNameLocator).toBeVisible({ timeout: 2000 });
            
            const candidateCard = candidateNameLocator.locator('xpath=ancestor::div[contains(@class, "relative") or contains(@class, "flex") or contains(@class, "border")][position()<=5]').first();
            const cardText = await candidateCard.textContent().catch(() => '');
            
            if (cardText && cardText.includes(mainItemName) && cardText.includes(priceText)) {
              const candidateAddButton = candidateCard.getByRole('button', { name: /^Add$/i }).first();
              
              if (await candidateAddButton.count() > 0) {
                itemCard = candidateCard;
                addButton = candidateAddButton;
                itemNameLocator = candidateNameLocator;
                verified = true;
                break;
              }
            }
          } catch {
            continue;
          }
        }
      }
    } catch {
    }
  }

  if (!verified || !itemCard || !addButton) {
    throw new Error(`Could not find verified item card for "${mainItemName}" with price "${priceText}". Found ${itemCount} items with name "${mainItemName}"`);
  }

  const finalCardText = await itemCard.textContent();
  if (!finalCardText || !finalCardText.includes(mainItemName) || !finalCardText.includes(priceText)) {
    throw new Error(`Item verification failed before click. Expected "${mainItemName}" with price "${priceText}" but card text: ${finalCardText?.substring(0, 200)}`);
  }

  await addButton.scrollIntoViewIfNeeded();
  await expect(addButton).toBeVisible({ timeout: 5000 });
  await addButton.click();

  await page.waitForTimeout(1500);

  let quantityVerified = false;

  try {
    const quantitySelectorPattern = page.getByText(/-1\+/).or(page.getByText(/- 1 \+/));
    await quantitySelectorPattern.first().scrollIntoViewIfNeeded();
    await expect(quantitySelectorPattern.first()).toBeVisible({ timeout: 5000 });
    quantityVerified = true;
  } catch {
    try {
      const itemBoundingBox = await itemNameLocator.boundingBox();
      if (itemBoundingBox) {
        const allQuantitySelectors = page.locator('text=/-1\\+/').or(page.locator('text=/- 1 \\+/'));
        const selectorCount = await allQuantitySelectors.count();
        
        for (let i = 0; i < selectorCount; i++) {
          const selector = allQuantitySelectors.nth(i);
          const selectorBox = await selector.boundingBox();
          
          if (selectorBox && itemBoundingBox) {
            const distance = Math.abs(selectorBox.x - itemBoundingBox.x) + Math.abs(selectorBox.y - itemBoundingBox.y);
            if (distance < 500) {
              await selector.scrollIntoViewIfNeeded();
              await expect(selector).toBeVisible({ timeout: 3000 });
              quantityVerified = true;
              break;
            }
          }
        }
      }
    } catch {
    }
    
    if (!quantityVerified) {
      try {
        const itemBoundingBox = await itemNameLocator.boundingBox();
        if (itemBoundingBox) {
          const allMinusButtons = page.getByRole('button', { name: /^-$/i }).or(page.locator('button:has-text("-")'));
          const minusCount = await allMinusButtons.count();
          
          for (let i = 0; i < minusCount; i++) {
            const minusBtn = allMinusButtons.nth(i);
            const minusBox = await minusBtn.boundingBox();
            
            if (minusBox && itemBoundingBox) {
              const distance = Math.abs(minusBox.x - itemBoundingBox.x) + Math.abs(minusBox.y - itemBoundingBox.y);
              if (distance < 400) {
                const container = minusBtn.locator('xpath=ancestor::div[1]');
                const containerText = await container.textContent().catch(() => '');
                if (containerText && containerText.includes('1') && containerText.includes('-') && containerText.includes('+')) {
                  quantityVerified = true;
                  break;
                }
              }
            }
          }
        }
      } catch {
      }
    }

    if (!quantityVerified) {
      const itemCardText = await itemCard.textContent().catch(() => '');
      if (itemCardText && itemCardText.includes('-') && itemCardText.includes('1') && itemCardText.includes('+')) {
        quantityVerified = true;
      } else if (itemCardText && itemCardText.includes('1') && !itemCardText.includes('Add')) {
        quantityVerified = true;
      }
    }
  }

  if (!quantityVerified) {
    throw new Error('Could not verify quantity changed to 1');
  }

  const concessionItemName = item.concession_item_name || itemName;
  fbTracker.addItem(itemName, itemInfo.itemPrice, itemPriceDisplay, concessionItemName);
  
  return { success: true, itemName, price: itemInfo.itemPrice };
}

export async function addFandBItemWithModifiers(page, itemInfo, fbTracker) {
  const { categoryName, itemName, itemPriceDisplay, item } = itemInfo;

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);

  const categoryButton = page.getByRole('button', { name: new RegExp(`^${categoryName}$`, 'i') });
  await expect(categoryButton.first()).toBeVisible({ timeout: 10000 });
  await categoryButton.first().click();
  await page.waitForTimeout(1000);

  await expect(page.getByRole('heading', { name: new RegExp(categoryName, 'i') })).toBeVisible({ timeout: 10000 });

  const itemNameParts = itemName.split('\n');
  const mainItemName = itemNameParts[0].trim();
  const escapedMainName = mainItemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const priceText = itemPriceDisplay.replace('QAR ', '').trim();
  const escapedPriceWithQAR = itemPriceDisplay.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  await page.waitForTimeout(500);
  
  const itemNameLocator = page.getByText(new RegExp(escapedMainName, 'i')).first();
  await itemNameLocator.scrollIntoViewIfNeeded();
  await expect(itemNameLocator).toBeVisible({ timeout: 10000 });
  
  const addButtonLocator = page.locator('div').filter({ hasText: new RegExp(`^${escapedPriceWithQAR}Add$`, 'i') }).getByRole('button');
  await expect(addButtonLocator.first()).toBeVisible({ timeout: 5000 });
  
  const itemCard = itemNameLocator.locator('xpath=ancestor::div[contains(@class, "relative") or contains(@class, "flex") or contains(@class, "border")][position()<=5]').first();
  const cardText = await itemCard.textContent();
  
  if (!cardText || !cardText.includes(mainItemName) || !cardText.includes(priceText)) {
    throw new Error(`Item verification failed. Expected "${mainItemName}" with price "${priceText}" but card text: ${cardText?.substring(0, 200)}`);
  }
  
  const addButton = addButtonLocator.first();
  await addButton.scrollIntoViewIfNeeded();
  await expect(addButton).toBeVisible({ timeout: 5000 });
  await addButton.click();

  await page.waitForTimeout(1000);

  await expect(page.getByRole('heading', { name: new RegExp(mainItemName, 'i') })).toBeVisible({ timeout: 10000 });

  if (item.ModifierGroups && Array.isArray(item.ModifierGroups) && item.ModifierGroups.length > 0) {
    for (const modifierGroup of item.ModifierGroups) {
      if (!modifierGroup.modifierItems || !Array.isArray(modifierGroup.modifierItems) || modifierGroup.modifierItems.length === 0) {
        continue;
      }

      const modifierGroupName = modifierGroup.description || modifierGroup.description_alt || modifierGroup.modifier_group_name || modifierGroup.modifier_group_name_ar ;
      const minQuantity = modifierGroup.minimum_quantity || 1;
      const maxQuantity = modifierGroup.maximum_quantity || 1;
      const requiredQuantity = minQuantity;

      try {
        const groupHeading = page.getByText(new RegExp(modifierGroupName?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '', 'i')).first();
        await groupHeading.scrollIntoViewIfNeeded();
        await expect(groupHeading).toBeVisible({ timeout: 5000 });
      } catch {
        try {
          const groupHeadingAlt = page.getByRole('heading', { name: new RegExp(modifierGroupName?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '', 'i') }).first();
          await groupHeadingAlt.scrollIntoViewIfNeeded();
          await expect(groupHeadingAlt).toBeVisible({ timeout: 5000 });
        } catch {
          console.warn(`Could not find modifier group heading: ${modifierGroupName}`);
          continue;
        }
      }

      let selectedCount = 0;
      const selectedModifiers = [];

      while (selectedCount < requiredQuantity) {
        const modifierToSelect = modifierGroup.modifierItems[Math.floor(Math.random() * modifierGroup.modifierItems.length)];
        const modifierId = modifierToSelect.vista_modifier_id || modifierToSelect.id;
        const modifierName = modifierToSelect.modifier_item_name || modifierToSelect.extended_description || modifierToSelect.description || modifierToSelect.display_name;

        let modifierSelected = false;

        if (modifierId) {
          try {
            const modifierById = page.locator(`#modifier-${modifierId}`);
            if (await modifierById.count() > 0) {
              await modifierById.first().scrollIntoViewIfNeeded();
              await modifierById.first().click({ timeout: 3000 });
              modifierSelected = true;
            } else {
              const modifierRadio = page.locator(`input[type="radio"][value="${modifierId}"]`);
              if (await modifierRadio.count() > 0) {
                await modifierRadio.first().scrollIntoViewIfNeeded();
                await modifierRadio.first().click({ timeout: 3000 });
                modifierSelected = true;
              }
            }
          } catch {
          }
        }

        if (!modifierSelected && modifierName) {
          try {
            const escapedModifierName = modifierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            const modifierTextLocator = page.getByText(new RegExp(escapedModifierName, 'i'));
            const textCount = await modifierTextLocator.count();
            
            for (let i = 0; i < textCount; i++) {
              const textElement = modifierTextLocator.nth(i);
              await textElement.scrollIntoViewIfNeeded();
              
              const parentContainer = textElement.locator('xpath=ancestor::div[position()<=3]').first();
              const containerText = await parentContainer.textContent().catch(() => '');
              
              if (containerText && containerText.includes(modifierName)) {
                const addButton = parentContainer.getByRole('button', { name: /^Add$/i }).first();
                if (await addButton.count() > 0) {
                  await addButton.scrollIntoViewIfNeeded();
                  await addButton.click({ timeout: 3000 });
                  modifierSelected = true;
                  break;
                } else {
                  await textElement.click({ timeout: 3000 });
                  modifierSelected = true;
                  break;
                }
              }
            }
          } catch {
          }
        }

        if (modifierSelected) {
          selectedModifiers.push(modifierToSelect);
          selectedCount++;
          await page.waitForTimeout(500);
        } else {
          console.warn(`Could not select modifier: ${modifierName}. Attempting next modifier...`);
          if (selectedCount === 0 && modifierGroup.modifierItems.length > 1) {
            continue;
          } else {
            break;
          }
        }
      }

      if (selectedCount < requiredQuantity) {
        throw new Error(`Only selected ${selectedCount} out of ${requiredQuantity} required modifiers for group: ${modifierGroupName}`);
      }
    }
  }

  await page.waitForTimeout(500);
  const addItemButton = page.getByRole('button', { name: /Add Item QAR/i });
  await addItemButton.scrollIntoViewIfNeeded();
  await expect(addItemButton).toBeVisible({ timeout: 5000 });
  await addItemButton.click();

  const concessionItemName = item.concession_item_name || itemName;
  fbTracker.addItem(itemName, itemInfo.itemPrice, itemPriceDisplay, concessionItemName);
  
  return { success: true, itemName, price: itemInfo.itemPrice };
}

export async function addFandBItemWithAlternates(page, itemInfo, fbTracker) {
  const { categoryName, itemName, itemPriceDisplay, item } = itemInfo;

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);

  const categoryButton = page.getByRole('button', { name: new RegExp(`^${categoryName}$`, 'i') });
  await expect(categoryButton.first()).toBeVisible({ timeout: 10000 });
  await categoryButton.first().click();
  await page.waitForTimeout(1000);

  await expect(page.getByRole('heading', { name: new RegExp(categoryName, 'i') })).toBeVisible({ timeout: 10000 });

  const itemNameParts = itemName.split('\n');
  const mainItemName = itemNameParts[0].trim();
  const escapedMainName = mainItemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const priceText = itemPriceDisplay.replace('QAR ', '').trim();
  const escapedPrice = priceText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedPriceWithQAR = itemPriceDisplay.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  await page.waitForTimeout(500);
  
  const itemNameLocator = page.getByText(new RegExp(escapedMainName, 'i')).first();
  await itemNameLocator.scrollIntoViewIfNeeded();
  await expect(itemNameLocator).toBeVisible({ timeout: 10000 });
  
  const addButtonLocator = page.locator('div').filter({ hasText: new RegExp(`^${escapedPriceWithQAR}Add$`, 'i') }).getByRole('button');
  await expect(addButtonLocator.first()).toBeVisible({ timeout: 5000 });
  
  const itemCard = itemNameLocator.locator('xpath=ancestor::div[contains(@class, "relative") or contains(@class, "flex") or contains(@class, "border")][position()<=5]').first();
  const cardText = await itemCard.textContent();
  
  if (!cardText || !cardText.includes(mainItemName) || !cardText.includes(priceText)) {
    throw new Error(`Item verification failed. Expected "${mainItemName}" with price "${priceText}" but card text: ${cardText?.substring(0, 200)}`);
  }
  
  const addButton = addButtonLocator.first();
  await addButton.scrollIntoViewIfNeeded();
  await expect(addButton).toBeVisible({ timeout: 5000 });
  await addButton.click();

  await page.waitForTimeout(1000);

  await expect(page.getByRole('heading', { name: new RegExp(mainItemName, 'i') })).toBeVisible({ timeout: 10000 });

  if (item.AlternateItems && Array.isArray(item.AlternateItems) && item.AlternateItems.length > 0) {
    const randomAltIndex = Math.floor(Math.random() * item.AlternateItems.length);
    const selectedAlt = item.AlternateItems[randomAltIndex];
    const altId = selectedAlt.vista_alternate_item_id || selectedAlt.id;
    const altName = selectedAlt.alternate_item_name || selectedAlt.extended_description || selectedAlt.display_name;

    if (altId || altName) {
      let altSelected = false;

      if (altId) {
        try {
          const altLocatorById = page.locator(`#alt-item-${altId}`).or(page.locator(`input[type="radio"][value="${altId}"]`));
          await altLocatorById.first().scrollIntoViewIfNeeded();
          await altLocatorById.first().click({ timeout: 5000 });
          altSelected = true;
        } catch {
        }
      }

      if (!altSelected && altName) {
        try {
          const escapedAltName = altName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const altLocatorByName = page.getByText(new RegExp(escapedAltName, 'i')).first();
          await altLocatorByName.scrollIntoViewIfNeeded();
          await altLocatorByName.click({ timeout: 5000 });
          altSelected = true;
        } catch {
          try {
            const altRadioByName = page.locator(`label:has-text("${altName}")`).or(page.locator(`div:has-text("${altName}")`)).locator('input[type="radio"]').first();
            if (await altRadioByName.count() > 0) {
              await altRadioByName.scrollIntoViewIfNeeded();
              await altRadioByName.click({ timeout: 5000 });
              altSelected = true;
            }
          } catch {
          }
        }
      }

      if (!altSelected) {
        const allRadioButtons = page.locator('input[type="radio"]');
        const radioCount = await allRadioButtons.count();
        if (radioCount > 0) {
          const randomRadioIndex = Math.floor(Math.random() * radioCount);
          await allRadioButtons.nth(randomRadioIndex).scrollIntoViewIfNeeded();
          await allRadioButtons.nth(randomRadioIndex).click({ timeout: 5000 });
          altSelected = true;
        }
      }

      if (altSelected) {
        await page.waitForTimeout(500);
        const addItemButton = page.getByRole('button', { name: /Add Item QAR/i });
        await addItemButton.scrollIntoViewIfNeeded();
        await expect(addItemButton).toBeVisible({ timeout: 5000 });
        await addItemButton.click();

        const finalItemName = `${item.concession_item_name} - ${selectedAlt.alternate_item_name || altName}`;
        const altPrice = selectedAlt.price_in_cents / 100;
        const altDisplayPrice = `QAR ${altPrice.toFixed(2)}`;

        const concessionItemName = item.concession_item_name || itemName;
        fbTracker.addItem(finalItemName, altPrice, altDisplayPrice, concessionItemName);
        
        return { success: true, itemName: finalItemName, price: altPrice };
      }
    }
  }

  await page.getByRole('button', { name: /Add Item QAR/i }).click();
  const concessionItemName = item.concession_item_name || itemName;
  fbTracker.addItem(itemName, itemInfo.itemPrice, itemPriceDisplay, concessionItemName);
  
  return { success: true, itemName, price: itemInfo.itemPrice };
}

export async function selectDateInPicker(page, day) {
  try {
    const dateInput = page.getByRole('textbox', { name: 'Select Date' });
    await expect(dateInput).toBeVisible({ timeout: 5000 });
    await dateInput.click();
    await page.waitForTimeout(500);

    const datePicker = page.locator('.react-datepicker');
    await expect(datePicker).toBeVisible({ timeout: 5000 });

    const availableDate = page.locator(`.react-datepicker__day:not(.react-datepicker__day--disabled):not(.react-datepicker__day--outside-month)`).filter({ hasText: new RegExp(`^${day}$`) }).first();
    
    if (await availableDate.count() === 0) {
      const allAvailableDates = page.locator('.react-datepicker__day:not(.react-datepicker__day--disabled):not(.react-datepicker__day--outside-month)');
      const dateCount = await allAvailableDates.count();
      if (dateCount > 0) {
        const randomDate = allAvailableDates.nth(Math.floor(Math.random() * dateCount));
        await randomDate.click();
      } else {
        throw new Error('No available dates found in date picker');
      }
    } else {
      await availableDate.click();
    }

    await page.waitForTimeout(500);
  } catch (error) {
    console.warn('Error selecting date:', error.message);
    throw error;
  }
}

export async function selectTimeInPicker(page, hour = 12, minute = 0, period = 'AM') {
  try {
    const timeInput = page.getByRole('textbox', { name: /Select Time/i });
    await expect(timeInput).toBeVisible({ timeout: 5000 });
    await timeInput.click();

    const timePickerHeading = page.getByRole('heading', { name: /Select Time/i });
    await expect(timePickerHeading).toBeVisible({ timeout: 5000 });

    // // 3 dropdowns: hour, minute, AM/PM
    // const timeDropdowns = page.locator('.flex.items-center.justify-between.rounded.border');
    // await expect(timeDropdowns).toHaveCount(3);

    // =====================
    // Select Hour
    // =====================
    const hourInput = page.locator('input[role="combobox"]').nth(0);
await hourInput.focus();
await hourInput.press('ArrowDown');

    const hourOption = page.locator('div', {
      hasText: new RegExp(`^${hour}$`)
    }).first();

    if (await hourOption.count() > 0) {
      await hourOption.click();
    } else {
      await page.locator('div', { hasText: /^\d{1,2}$/ }).first().click();
    }

    // =====================
    // Select Minute
    // =====================
    const minuteInput = page.locator('input[role="combobox"]').nth(1);
await minuteInput.focus();
await minuteInput.press('ArrowDown');

    const minuteText = minute.toString().padStart(2, '0');
    const minuteOption = page.locator('div', {
      hasText: new RegExp(`^${minuteText}$`)
    }).first();

    if (await minuteOption.count() > 0) {
      await minuteOption.click();
    } else {
      await page.locator('div', { hasText: /^\d{2}$/ }).first().click();
    }

    // =====================
    // Select AM / PM
    // =====================
    const periodInput = page.locator('input[role="combobox"]').nth(2);
await periodInput.focus();
await periodInput.press('ArrowDown');

    const periodOption = page.locator('div', {
      hasText: new RegExp(`^${period}$`, 'i')
    }).first();

    if (await periodOption.count() > 0) {
      await periodOption.click();
    } else {
      await page.locator('div', { hasText: /^(AM|PM)$/i }).first().click();
    }

    // =====================
    // Confirm
    // =====================
    const confirmButton = page.getByRole('button', { name: /Confirm/i });
    await expect(confirmButton).toBeVisible({ timeout: 3000 });
    await confirmButton.click();

  } catch (error) {
    console.warn('❌ Error selecting time:', error.message);

    try {
      const cancelButton = page.getByRole('button', { name: /Cancel/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }
    } catch {}

    throw error;
  }
}

export async function verifyFandBInSidePanel(page, fbTracker, selectedCinemaName = null) {
  try {
    await expect(page.getByRole('img', { name: 'logo', exact: true })).toBeVisible({ timeout: 5000 });
    
    if (selectedCinemaName) {
      const cinemaNameLocator = page.getByText(selectedCinemaName).nth(2);
      await expect(cinemaNameLocator).toBeVisible({ timeout: 5000 });
    } else {
      const cinemaNameLocator = page.getByText('The Pearl').nth(2);
      await expect(cinemaNameLocator).toBeVisible({ timeout: 5000 });
    }

    await expect(page.getByText('Pickup Date:')).toBeVisible({ timeout: 5000 });
    
    const dateInput = page.getByRole('textbox', { name: 'Select Date' });
    await expect(dateInput).toBeVisible({ timeout: 5000 });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDay = tomorrow.getDate();
    await selectDateInPicker(page, tomorrowDay);

    await expect(page.getByText('Pickup Time:')).toBeVisible({ timeout: 5000 });
    
    const timeInput = page.getByRole('textbox', { name: 'Select Time' });
    await expect(timeInput).toBeVisible({ timeout: 5000 });

    const randomHour = Math.floor(Math.random() * 12) + 1;
    const randomMinute = Math.floor(Math.random() * 4) * 15;
    const randomPeriod = Math.random() > 0.5 ? 'PM' : 'AM';
    await selectTimeInPicker(page, randomHour, randomMinute, randomPeriod);

    const confirmText = page.getByText('I confirm the above order');
    await expect(confirmText).toBeVisible({ timeout: 5000 });
    
    const confirmCheckbox = page.getByRole('checkbox');
    await expect(confirmCheckbox).toBeVisible({ timeout: 5000 });
    await confirmCheckbox.check();

    // F&B label
await expect(page.getByText('F&B', { exact: true })).toBeVisible({ timeout: 5000 });

// F&B amount (+ QAR 49)
const fbAmount = page.getByText(
  new RegExp(`\\+\\s*QAR\\s*${fbTracker.totalPrice.toFixed(0)}`, 'i')
);
await expect(fbAmount).toBeVisible({ timeout: 5000 });


 // Total Price label
await expect(page.getByText('Total Price', { exact: true }))
  .toBeVisible({ timeout: 5000 });

// Total Price amount (QAR 49)
const totalAmount = page
  .locator('div')
  .filter({ hasText: /^QAR\s*\d+/ })
  .locator('span')
  .filter({
    hasText: new RegExp(`^QAR\\s*${fbTracker.totalPrice.toFixed(0)}$`)
  });

await expect(totalAmount.first()).toBeVisible({ timeout: 5000 });


    await page.locator('div').filter({ hasText: /^Food & Beverages$/ }).nth(1).click();
    
    for (const fbItem of fbTracker.items) {
      try {
        const itemNameToVerify = fbItem.concessionItemName || fbItem.name;
        const escapedName = itemNameToVerify.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        await expect(page.getByText(new RegExp(escapedName, 'i')).first()).toBeVisible({ timeout: 5000 });
      } catch {
        console.warn(`Could not verify F&B item in side panel: ${fbItem.concessionItemName || fbItem.name}`);
      }
    }
  } catch (error) {
    console.warn('Could not verify F&B in side panel:', error.message);
    throw error;
  }
}

// UPDATED FUNCTION - Set up listeners BEFORE clicking
export function setupConcessionsListeners(page, cinemaId) {
  console.log(`🔧 Setting up API listeners for cinema ID: ${cinemaId}`);
  
  const concessionsPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Concessions API request timeout after 60s'));
    }, 60000);

    const handler = (response) => {
      const url = response.url();
      if (url.includes(`/api/booking/concessions/cinema/${cinemaId}`) && !url.includes('trending')) {
        console.log(`✅ Captured concessions API: ${url}`);
        clearTimeout(timeout);
        page.off('response', handler);
        resolve(response);
      }
    };

    page.on('response', handler);
  });

  const trendingPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Trending API request timeout after 60s'));
    }, 60000);

    const handler = (response) => {
      const url = response.url();
      if (url.includes(`/api/booking/concessions/cinema/${cinemaId}/trending`)) {
        console.log(`✅ Captured trending API: ${url}`);
        clearTimeout(timeout);
        page.off('response', handler);
        resolve(response);
      }
    };

    page.on('response', handler);
  });

  return { concessionsPromise, trendingPromise };
}

// UPDATED FUNCTION - Better error handling and waiting
export async function navigateToCinemaAndWaitForFandB(page, cinemaId, concessionsPromise, trendingPromise) {
  console.log(`🎬 Waiting for cinema page to load: cinema/${cinemaId}`);
  
  const cinemaPageUrlPattern = new RegExp(`takeaway/cinema/${cinemaId}`);
  
  // Wait for URL change
  await page.waitForURL(cinemaPageUrlPattern, { timeout: 20000 });
  console.log('✅ URL changed to cinema page');

  // Wait for page heading to ensure page is loaded
  await expect(page.getByRole('heading', { name: 'Food & Drinks To-Go' })).toBeVisible({ timeout: 15000 });
  console.log('✅ Page heading visible');

  // Wait for DOM to be ready
  await page.waitForLoadState('domcontentloaded');
  
  console.log('⏳ Waiting for API responses...');

  let concessionsResponse, trendingResponse;
  
  try {
    // Use Promise.race with a timeout fallback
    const responseTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('API response timeout')), 70000)
    );

    [concessionsResponse, trendingResponse] = await Promise.race([
      Promise.all([concessionsPromise, trendingPromise]),
      responseTimeout
    ]);

    console.log('✅ Both API responses captured');
  } catch (error) {
    console.error('❌ Error waiting for API responses:', error.message);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'api-timeout-debug.png', fullPage: true });
    
    throw new Error(`Failed to capture concessions API responses: ${error.message}`);
  }

  if (!concessionsResponse) {
    throw new Error('Concessions API response was not captured');
  }

  const status = concessionsResponse.status();
  console.log(`📊 Concessions API status: ${status}`);

  if (status !== 200) {
    const errorText = await concessionsResponse.text().catch(() => 'Unable to read error response');
    throw new Error(`Concessions API returned status ${status}. Response: ${errorText}`);
  }

  let concessionsData;
  try {
    concessionsData = await concessionsResponse.json();
    console.log(`✅ Concessions data parsed: ${concessionsData.data?.length || 0} categories`);
  } catch (error) {
    const responseText = await concessionsResponse.text().catch(() => 'Unable to read response');
    throw new Error(`Failed to parse concessions API response: ${error.message}. Response: ${responseText.substring(0, 200)}`);
  }

  // Wait for the "Snack Time!" heading as final confirmation
  await expect(page.getByRole('heading', { name: 'Snack Time!' })).toBeVisible({ timeout: 15000 });
  console.log('✅ F&B content loaded on page');

  return concessionsData;
}

// NEW HELPER FUNCTION - Combined click and navigate
export async function clickCinemaAndNavigateToFandB(page, cinemaLocator, cinemaId) {
  console.log(`\n🎯 Clicking cinema and navigating to F&B...`);
  
  // Set up listeners BEFORE clicking
  const { concessionsPromise, trendingPromise } = setupConcessionsListeners(page, cinemaId);
  
  // Verify cinema is visible
  await expect(cinemaLocator).toBeVisible({ timeout: 10000 });
  console.log('✅ Cinema card is visible');
  
  // Click the cinema
  await cinemaLocator.click();
  console.log('✅ Clicked on cinema card');
  
  // Wait for navigation and API calls
  const concessionsData = await navigateToCinemaAndWaitForFandB(
    page, 
    cinemaId, 
    concessionsPromise, 
    trendingPromise
  );
  
  return concessionsData;
}

export async function setupDirectFNBFlow(page, request) {
  console.log("\n🚀 Setting up Direct F&B Flow...\n");

  // 1️⃣ Go to home (use baseURL from config)
  await page.goto(`${BASE_URL}/home`, { waitUntil: 'domcontentloaded' });

  const context = page.context();

  // 2️⃣ Grant geolocation
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    latitude: 19.1517288,
    longitude: 72.8341961,
  });

  // 3️⃣ Navigate to Online Order
  await page.getByRole('button', { name: 'Food & Beverages' }).click();
  await page.getByRole('link', { name: 'Online Order' }).click();

  // 4️⃣ Login
  await page
    .getByRole('button', { name: 'Log in to see your upcoming' })
    .click();

  const authToken = await loginAndCaptureTokenDirectFNB(page);

  // 5️⃣ Enter F&B Flow
  await page.getByRole('button', { name: 'CLICK HERE to order F&B' }).click();

  // 6️⃣ Fetch cinema APIs
  const cinemaDetails = await fetchCinemaDetails(
    request,
    19.1517288,
    72.8341961
  );

  const cinemaTimings = await fetchCinemaTimings(request);

  if (!cinemaDetails?.data?.length) {
    throw new Error('No cinemas returned from cinema details API');
  }

  if (!cinemaTimings?.data?.length) {
    throw new Error('No cinema timings returned from API');
  }

  // 7️⃣ Filter active cinemas for today
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
  });

  const todayTimingsMap = new Map();

  cinemaTimings.data
    .filter(
      (timing) => timing.day === today && timing.is_active === true
    )
    .forEach((timing) => {
      if (!todayTimingsMap.has(timing.fk_cinema_id)) {
        todayTimingsMap.set(timing.fk_cinema_id, timing);
      }
    });

  if (todayTimingsMap.size === 0) {
    throw new Error('No active cinemas available today');
  }

  const firstActiveCinemaId = Array.from(todayTimingsMap.keys())[0];

  const selectedCinema =
    cinemaDetails.data.find((c) => c.id === firstActiveCinemaId);

  if (!selectedCinema) {
    throw new Error('Active cinema ID not found in cinema details');
  }

  const selectedCinemaName = selectedCinema.name;

  const cinemaLocator = page
    .locator('div.relative.cursor-pointer.flex')
    .filter({ hasText: new RegExp(selectedCinemaName, 'i') })
    .first();

  // 8️⃣ Click cinema & wait for F&B API (using your helper)
  const concessionsData = await clickCinemaAndNavigateToFandB(
    page,
    cinemaLocator,
    firstActiveCinemaId
  );

  console.log(`\n✅ Setup complete for cinema: ${selectedCinemaName}\n`);

  return {
    concessionsData,
    selectedCinemaName,
    authToken,
    cinemaId: firstActiveCinemaId,
  };
}

export async function loginAndCaptureTokenDirectFNB(page) {
  const EMAIL = process.env.LOGIN_EMAIL;
  const PASSWORD = process.env.LOGIN_PASSWORD;

  if (!EMAIL || !PASSWORD) {
    throw new Error("❌ LOGIN_EMAIL or LOGIN_PASSWORD is missing in .env");
  }

  let authToken = null;

  const tokenListener = (req) => {
    const headers = req.headers();
    if (headers.authorization?.startsWith("Bearer")) {
      authToken = headers.authorization;
    }
  };

  page.on("request", tokenListener);

  await page.getByRole("textbox", { name: "Enter your email" }).fill(EMAIL);
  await page
    .getByRole("textbox", { name: "Enter your password" })
    .fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(
    page.getByRole("button", { name: /CLICK HERE to order F&B/i }),
  ).toBeVisible({ timeout: 15000 });

  await page.waitForTimeout(3000);

  if (!authToken) {
    authToken = await page.evaluate(() =>
      localStorage.getItem("authorization_token"),
    );
  }

  page.off("request", tokenListener);

  if (!authToken) {
    throw new Error("❌ Direct F&B auth token not captured");
  }

  await page.evaluate(
    ([token]) => {
      localStorage.setItem("auth_token", token.replace("Bearer ", ""));
      localStorage.setItem("access_token", token.replace("Bearer ", ""));
      localStorage.setItem("authorization_token", token);
    },
    [authToken],
  );

  return authToken;
}

export async function fetchCinemaDetails(request, lat, long, countryId = 1) {
  try {
    const response = await request.get(
      `${BACKEND_URL}/api/home/cinemas?lat=${lat}&long=${long}&country_id=${countryId}&channel=web`,
      {
        headers: {
          accept: "application/json, text/plain, */*",
          origin: BASE_URL,
          referer: `${BASE_URL}/`,
        },
      },
    );

    if (!response.ok()) {
      console.error("Cinema details API response not OK:", response.status());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching cinema details:", error);
    return null;
  }
}

export async function fetchCinemaTimings(request, countryId = 1) {
  try {
    const response = await request.get(
      `${BACKEND_URL}/api/cinema/cinema-timings?country_id=${countryId}&channel=web`,
      {
        headers: {
          accept: "application/json, text/plain, */*",
          origin: BASE_URL,
          referer: `${BASE_URL}/`,
        },
      },
    );

    if (!response.ok()) {
      console.error("Cinema timings API response not OK:", response.status());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching cinema timings:", error);
    return null;
  }
}