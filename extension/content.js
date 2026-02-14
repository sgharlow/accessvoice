// extension/content.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "execute_action") return;

  const { action, params } = message;

  try {
    switch (action) {
      case "click": {
        const el = findElement(params);
        if (!el) {
          sendResponse({ success: false, error: `Element not found: ${JSON.stringify(params)}` });
          return;
        }
        el.click();
        sendResponse({ success: true });
        break;
      }

      case "type": {
        const el = findElement(params);
        if (!el) {
          sendResponse({ success: false, error: `Element not found: ${JSON.stringify(params)}` });
          return;
        }
        el.focus();
        el.value = "";
        for (const char of params.text) {
          el.value += char;
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: char }));
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (params.pressEnter) {
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
          el.form?.submit();
        }
        sendResponse({ success: true });
        break;
      }

      case "scroll": {
        const amount = params.amount || 500;
        const direction = params.direction || "down";
        window.scrollBy({
          top: direction === "down" ? amount : -amount,
          behavior: "smooth",
        });
        sendResponse({ success: true });
        break;
      }

      case "get_page_info": {
        const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
          .slice(0, 20)
          .map((el, i) => ({
            index: i,
            tag: el.tagName.toLowerCase(),
            type: el.type || "",
            name: el.name || "",
            placeholder: el.placeholder || "",
            ariaLabel: el.getAttribute("aria-label") || "",
            value: el.value || "",
            selector: generateSelector(el),
          }));

        const links = Array.from(document.querySelectorAll("a[href]"))
          .slice(0, 30)
          .map((el, i) => ({
            index: i,
            text: el.textContent?.trim().slice(0, 100) || "",
            href: el.href,
            selector: generateSelector(el),
          }));

        const buttons = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"))
          .slice(0, 20)
          .map((el, i) => ({
            index: i,
            text: el.textContent?.trim().slice(0, 100) || el.value || "",
            ariaLabel: el.getAttribute("aria-label") || "",
            selector: generateSelector(el),
          }));

        sendResponse({
          success: true,
          data: {
            url: window.location.href,
            title: document.title,
            inputs,
            links,
            buttons,
          },
        });
        break;
      }

      case "back": {
        history.back();
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }

  return true;
});

// --- Element Finding ---

function findElement(params) {
  if (params.selector) {
    return document.querySelector(params.selector);
  }
  if (params.text) {
    const xpath = `//*[contains(text(), '${params.text.replace(/'/g, "\\'")}')]`;
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue;
  }
  if (params.ariaLabel) {
    return document.querySelector(`[aria-label="${params.ariaLabel}"]`);
  }
  if (params.placeholder) {
    return document.querySelector(`[placeholder="${params.placeholder}"]`);
  }
  if (params.name) {
    return document.querySelector(`[name="${params.name}"]`);
  }
  return null;
}

// --- Selector Generation ---

function generateSelector(el) {
  if (el.id) return `#${el.id}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
  if (el.getAttribute("aria-label")) return `[aria-label="${el.getAttribute("aria-label")}"]`;
  const parent = el.parentElement;
  if (!parent) return el.tagName.toLowerCase();
  const siblings = Array.from(parent.children).filter((s) => s.tagName === el.tagName);
  const index = siblings.indexOf(el) + 1;
  return `${generateSelector(parent)} > ${el.tagName.toLowerCase()}:nth-of-type(${index})`;
}
