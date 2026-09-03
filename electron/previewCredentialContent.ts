/**
 * Credential autofill content script — injected into every preview page via
 * executeJavaScript. Detects login forms, shows a saved-accounts dropdown,
 * saves credentials on submit, and fills the form when an account is picked.
 *
 * This file is a string constant (not a module) so it can be inlined into the
 * main process bundle and injected via WebContents.executeJavaScript().
 */
export const CREDENTIAL_CONTENT_SCRIPT = `(() => {
  'use strict'
  var api = (window).__devlauncherCredentialApi
  if (!api) return
  var cred = api
  var origin = window.location.origin
  if (!origin || origin === 'null') return
  var dropdown = null
  var currentField = null
  var accounts = []
  function isPasswordInput(el) { return el.type === 'password' }
  function isTextField(el) {
    return !el.type || ['text', 'email', 'username', 'tel'].includes(el.type)
  }
  function isLoginForm(form) {
    var inputs = Array.from(form.querySelectorAll('input'))
    var passwordInputs = inputs.filter(isPasswordInput)
    if (passwordInputs.length !== 1) return false
    var textInputs = inputs.filter(function(i) { return isTextField(i) && i.type !== 'hidden' })
    if (textInputs.length < 1) return false
    var textFieldNames = textInputs.map(function(i) { return (i.name || i.id || '').toLowerCase() })
    if (textFieldNames.some(function(n) { return /signup|register|fullname|full-name/.test(n) })) return false
    return true
  }
  function findUsernameField(form) {
    var inputs = Array.from(form.querySelectorAll('input'))
    var password = inputs.find(isPasswordInput)
    if (!password) return null
    var texts = inputs.filter(function(i) { return isTextField(i) && i.type !== 'hidden' })
    if (!texts.length) return null
    var ac = texts.find(function(i) { return ['username', 'email'].includes((i.getAttribute('autocomplete') || '').toLowerCase()) })
    if (ac) return ac
    var before = texts.filter(function(i) { return i.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING })
    return before[before.length - 1] || texts[0]
  }
  function parseForm(form) {
    var passwordEl = Array.from(form.querySelectorAll('input')).find(isPasswordInput)
    if (!passwordEl) return null
    var usernameEl = findUsernameField(form)
    if (!usernameEl) return null
    var username = usernameEl.value.trim()
    var password = passwordEl.value
    if (!username || !password) return null
    return { username: username, password: password }
  }
  function setNativeValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    var valueSetter = Object.getOwnPropertyDescriptor(proto, 'value').set
    if (valueSetter) valueSetter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  function fillFields(field, username, password) {
    var form = field.closest('form')
    if (!form) return
    var usernameEl = findUsernameField(form)
    var passwordEl = Array.from(form.querySelectorAll('input')).find(isPasswordInput)
    if (!passwordEl) return
    if (usernameEl) setNativeValue(usernameEl, username)
    setNativeValue(passwordEl, password)
  }
  function positionDropdown(field) {
    if (!dropdown) return
    var rect = field.getBoundingClientRect()
    dropdown.style.top = window.scrollY + rect.bottom + 4 + 'px'
    dropdown.style.left = window.scrollX + rect.left + 'px'
  }
  function hideDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null }
    currentField = null
  }
  function showDropdown(field) {
    if (!accounts.length) return
    hideDropdown()
    currentField = field
    dropdown = document.createElement('div')
    dropdown.style.cssText = 'position:absolute;z-index:2147483647;background:#fff;color:#1f2937;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:' + Math.max(180, field.offsetWidth) + 'px;font-family:system-ui,sans-serif;font-size:13px;overflow:hidden'
    var title = document.createElement('div')
    title.textContent = 'Saved accounts'
    title.style.cssText = 'padding:6px 10px;font-size:11px;color:#6b7280;background:#f3f4f6;border-bottom:1px solid #e5e7eb'
    dropdown.appendChild(title)
    accounts.forEach(function(account) {
      var row = document.createElement('div')
      row.style.cssText = 'padding:8px 10px;cursor:pointer;display:flex;align-items:center;gap:8px'
      row.textContent = account.username
      row.addEventListener('mouseenter', function() { row.style.background = '#f3f4f6' })
      row.addEventListener('mouseleave', function() { row.style.background = '' })
      row.addEventListener('click', function() { fillFields(field, account.username, account.password); hideDropdown() })
      dropdown.appendChild(row)
    })
    document.body.appendChild(dropdown)
    positionDropdown(field)
  }
  cred.getCredentials(origin).then(function(saved) {
    accounts = saved || []
    if (!accounts.length) return
    document.addEventListener('focusin', function(e) {
      var target = e.target
      if (target.tagName !== 'INPUT') return
      if (!isTextField(target)) return
      var form = target.closest('form')
      if (!form || !isLoginForm(form)) return
      if (target !== findUsernameField(form)) return
      showDropdown(target)
    })
    document.addEventListener('focusout', function(e) {
      var target = e.target
      if (dropdown && !dropdown.contains(target)) {
        setTimeout(function() { if (!dropdown || !dropdown.contains(document.activeElement)) hideDropdown() }, 150)
      }
    })
    window.addEventListener('resize', function() { if (currentField) positionDropdown(currentField) })
    window.addEventListener('scroll', function() { if (currentField) positionDropdown(currentField) }, true)
  })
  document.addEventListener('submit', function(e) {
    var form = e.target
    if (!form || form.tagName !== 'FORM') return
    if (!isLoginForm(form)) return
    var creds = parseForm(form)
    if (creds) { cred.saveCredential(origin, creds.username, creds.password) }
  }, true)
  cred.onFillRequest(function(data) {
    var form = document.querySelector('form')
    if (!form) return
    var usernameEl = findUsernameField(form)
    if (!usernameEl) return
    fillFields(usernameEl, data.username, data.password)
  })
})()`