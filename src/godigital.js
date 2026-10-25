// Picture guides for everyday apps: each lesson is a series of steps, and each step shows a simplified
// phone screen with the button to press marked (data-id = the step's `tap`). Screens are plain HTML
// strings, so the tests can check every step's button really is on its screen.
//
// Where we have them, a step shows the app's real screen (a screenshot, `shot`) with the buttons laid over
// it; otherwise a simplified drawing (`screen`). Real apps change their look often and differ between
// phones. Screen labels stay in English (as most phones show them); the captions are in each language.

// ---- Screen pieces ----------------------------------------------------------------------------------

const top = (title, back = true) => `<div class="gd-top">${back ? '<span class="gd-back" aria-hidden="true">‹</span>' : ''}<b>${title}</b></div>`;
const btn = (id, label, kind = '') => `<div class="gd-btn ${kind}" data-id="${id}">${label}</div>`;
const row = (id, icon, title, sub = '', right = '') => `<div class="gd-row" ${id ? `data-id="${id}"` : ''}>
  <span class="gd-ic">${icon}</span><span class="gd-rt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right ? `<span class="gd-rr">${right}</span>` : ''}</div>`;
const field = (id, label, value, placeholder = '') => `<div class="gd-field" ${id ? `data-id="${id}"` : ''}><small>${label}</small><span class="${value ? '' : 'ph'}">${value || placeholder}</span></div>`;
const search = (id, text, typed = false) => `<div class="gd-search ${typed ? 'typed' : ''}" data-id="${id}">🔍 <span>${text}</span></div>`;
const tabs = (list, active) => `<div class="gd-tabs">${list.map(([id, icon, label]) => `<div class="gd-tab ${id === active ? 'on' : ''}" data-id="${id}"><span>${icon}</span><small>${label}</small></div>`).join('')}</div>`;
const tile = (id, icon, label) => `<div class="gd-tile" data-id="${id}"><span>${icon}</span><small>${label}</small></div>`;
const map = (label = 'You are here') => `<div class="gd-map"><span class="gd-road h" style="top:30%"></span><span class="gd-road h" style="top:68%"></span><span class="gd-road v" style="left:28%"></span><span class="gd-road v" style="left:74%"></span><span class="gd-park"></span><span class="gd-pin">📍<small>${label}</small></span></div>`;
const keypad = () => `<div class="gd-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => `<span>${k}</span>`).join('')}</div>`;

// ---- Shared screens --------------------------------------------------------------------------------

const store = ({ app, icon, color }) => `${top('App Store / Play Store', false)}
  ${search('search', app, true)}
  <div class="gd-store">
    <span class="gd-appicon" style="background:${color}">${icon}</span>
    <span class="gd-rt"><b>${app}</b><small>⭐ 4.7 · Free</small></span>
    ${btn('get', 'Get', 'small')}
  </div>
  <p class="gd-note">Look for the official app. Check the name and maker before you install.</p>`;

const otp = ({ who = 'the app' } = {}) => `${top('Verify your number')}
  <p class="gd-p">Enter the 6-digit code we sent by SMS to <b>9123 4567</b></p>
  <div class="gd-otp" data-id="otp">${'<span>•</span>'.repeat(4)}<span></span><span></span></div>
  <p class="gd-note">💬 SMS from ${who}: "Your code is 4827••. Never share this code."</p>
  ${keypad()}`;

// ---- Grab ------------------------------------------------------------------------------------------

const GRAB_TABS = [['tab-home', '🏠', 'Home'], ['tab-activity', '🧾', 'Activity'], ['tab-payment', '💳', 'Payment'], ['tab-messages', '💬', 'Messages'], ['tab-account', '👤', 'Account']];
const CARS = [
  ['car-just', '🚘', 'JustGrab', 'Taxi or car, fixed price', '$14'],
  ['car-taxi', '🚕', 'Standard Taxi', 'Metered fare', '$12–16'],
  ['car-6', '🚐', 'GrabCar 6-Seater', 'Up to 6 people', '$22'],
  ['car-family', '👶', 'GrabFamily', 'With a child seat', '$19'],
  ['car-assist', '♿', 'GrabAssist', 'Help for seniors · fits a foldable wheelchair', '$16'],
  ['car-premium', '✨', 'GrabCar Premium', 'Bigger, more comfortable', '$28'],
];

const grab = {
  welcome: () => `<div class="gd-hero"><span class="gd-appicon big">🚗</span><b>Welcome</b><small>Rides, food and more</small></div>
    ${btn('mobile', '📱 Continue with Mobile Number', 'primary')}
    ${btn('google', 'Continue with Google', 'ghost')}
    ${btn('apple', 'Continue with Apple', 'ghost')}`,
  phone: () => `${top('Your mobile number')}
    <div class="gd-field"><small>Mobile number</small><span>🇸🇬 +65 &nbsp;9123 4567</span></div>
    ${btn('next', 'Next', 'primary')}
    ${keypad()}`,
  name: () => `${top('About you')}
    ${field('', 'Full name', 'Tan Ah Kow')}
    ${field('', 'Email (optional)', 'ahkow@email.com')}
    ${btn('done', 'Done', 'primary')}`,
  home: () => `<div class="gd-greet"><b>Good morning, Ah Kow 👋</b></div>
    ${search('search', 'Search the app')}
    <div class="gd-grid">${tile('transport', '🚗', 'Transport')}${tile('food', '🍔', 'Food')}${tile('mart', '🛒', 'Mart')}${tile('express', '📦', 'Express')}${tile('dine', '🍽️', 'Dine Out')}${tile('offers', '🎁', 'Offers')}${tile('pay', '💳', 'GrabPay')}${tile('more', '⋯', 'All')}</div>
    <div class="gd-banner">🎉 Save on your next ride</div>
    ${tabs(GRAB_TABS, 'tab-home')}`,
  whereto: ({ saved = false } = {}) => `${top('Transport')}
    ${map()}
    <div class="gd-sheet">
      ${search('search', 'Where to?')}
      ${saved ? row('savedhome', '🏠', 'Home', 'Blk 520 Tampines St 52') : row('', '🏠', 'Add Home', 'Save your address', '＋')}
      ${row('', '🕘', 'Tampines Mall', '4 Tampines Central 5')}
      ${row('', '🕘', 'Changi General Hospital', '2 Simei St 3')}
    </div>`,
  results: () => `${top('Where to?')}
    ${search('search', 'Tampines Mall', true)}
    ${row('result1', '📍', 'Tampines Mall', '4 Tampines Central 5')}
    ${row('', '📍', 'Tampines Mall Bus Stop', 'Tampines Ave 4')}
    ${row('', '📍', 'Tampines 1', '10 Tampines Central 1')}
    ${keypad()}`,
  pickup: () => `${top('Pick-up point')}
    ${map('Pick up here')}
    <div class="gd-sheet">
      ${row('', '🟢', 'Blk 520 Tampines St 52', 'Your pick-up point')}
      ${btn('confirm', 'Confirm Pick-up', 'primary')}
    </div>`,
  cartypes: ({ scroll = false } = {}) => `${top('Choose a ride')}
    <div class="gd-route">🟢 Blk 520 Tampines St 52<br>🔴 Tampines Mall</div>
    <div class="gd-cars">${(scroll ? CARS.slice(2) : CARS.slice(0, 4)).map(([id, icon, name, sub, price]) => row(id, icon, name, sub, `<b>${price}</b>`)).join('')}</div>
    <div class="gd-sheet tight">
      ${row('pay', '💵', 'Cash', 'Tap to change', '›')}
      ${btn('book', 'Book JustGrab', 'primary')}
    </div>`,
  finding: () => `${top('Your ride')}
    ${map('Finding a driver…')}
    <div class="gd-sheet"><div class="gd-spin"></div><p class="gd-p center">Finding you a driver…<br><small>This usually takes a minute.</small></p>${btn('cancel', 'Cancel', 'ghost')}</div>`,
  driver: () => `${top('Your ride')}
    ${map('Driver arriving')}
    <div class="gd-sheet">
      <p class="gd-p"><b>Driver arriving in 4 min</b></p>
      <div class="gd-driver"><span class="gd-face">🧑🏻</span><span class="gd-rt"><b>Mr Lim · ⭐ 4.9</b><small>White Toyota Prius</small></span><span class="gd-plate" data-id="plate">SGX 1234 A</span></div>
      <div class="gd-actions">${btn('call', '📞 Call', 'ghost')}${btn('chat', '💬 Chat', 'ghost')}${btn('share', '🔗 Share ride', 'ghost')}</div>
      <div class="gd-sos" data-id="sos">🆘 Emergency</div>
    </div>`,
  foodhome: () => `${top('Food')}
    <div class="gd-addr">📍 Deliver to <b>Blk 520 Tampines St 52</b></div>
    ${search('search', 'What would you like to eat?')}
    <div class="gd-grid four">${tile('', '🍚', 'Rice')}${tile('', '🍜', 'Noodles')}${tile('', '🧋', 'Drinks')}${tile('', '🥗', 'Healthy')}</div>
    ${row('shop1', '🍗', 'Ah Hock Chicken Rice', '⭐ 4.6 · 25 min · $1.99 delivery')}
    ${row('', '🍜', 'Wanton Noodle House', '⭐ 4.5 · 30 min')}
    ${row('', '🥟', 'Golden Dim Sum', '⭐ 4.7 · 35 min')}`,
  restaurant: ({ basket = false } = {}) => `${top('Ah Hock Chicken Rice')}
    <div class="gd-shopbanner">🍗</div>
    ${row('dish1', '🍗', 'Steamed Chicken Rice', '$4.50', '<span class="gd-plus">＋</span>')}
    ${row('', '🍗', 'Roasted Chicken Rice', '$4.50', '<span class="gd-plus">＋</span>')}
    ${row('', '🥬', 'Oyster Sauce Vegetables', '$5.00', '<span class="gd-plus">＋</span>')}
    ${basket ? `<div class="gd-basketbar" data-id="basket">🧺 1 item · View basket <b>$4.50</b></div>` : ''}`,
  dish: () => `${top('Steamed Chicken Rice')}
    <div class="gd-shopbanner">🍗</div>
    <p class="gd-p"><b>Choose your rice</b></p>
    ${row('', '◉', 'Normal rice')}${row('', '○', 'Less rice')}
    <p class="gd-p"><b>Note to shop</b> <small>(optional)</small></p>
    ${field('', '', '', 'e.g. no cucumber')}
    <div class="gd-qty">−&nbsp; 1 &nbsp;＋</div>
    ${btn('add', 'Add to Basket · $4.50', 'primary')}`,
  checkout: () => `${top('Review order')}
    ${row('address', '📍', 'Blk 520 Tampines St 52 #08-123', 'Delivery address · tap to change', '›')}
    ${row('', '🍗', '1 × Steamed Chicken Rice', '', '$4.50')}
    ${row('', '🛵', 'Delivery fee', '', '$1.99')}
    ${row('pay', '💳', 'Visa •••• 4242', 'Payment · tap to change', '›')}
    <div class="gd-total">Total <b>$6.49</b></div>
    ${btn('place', 'Place Order', 'primary')}`,
  tracking: () => `${top('Your order')}
    ${map('Rider on the way')}
    <div class="gd-sheet">
      <p class="gd-p"><b>Arriving in 20 min</b></p>
      <ol class="gd-progress"><li class="done">Order confirmed</li><li class="done">Shop is preparing</li><li class="now">🛵 Rider on the way</li><li>Delivered</li></ol>
    </div>`,
  account: () => `${top('Account', false)}
    <div class="gd-greet"><span class="gd-face">🧓🏻</span> <b>Tan Ah Kow</b></div>
    ${row('saved', '⭐', 'Saved Places', '', '›')}
    ${row('', '💳', 'Payment Methods', '', '›')}
    ${row('', '🛡️', 'Safety', '', '›')}
    ${row('', '❓', 'Help Centre', '', '›')}
    ${row('', '⚙️', 'Settings', '', '›')}
    ${tabs(GRAB_TABS, 'tab-account')}`,
  saved: () => `${top('Saved Places')}
    ${row('home', '🏠', 'Home', 'Add your home address', '＋')}
    ${row('', '💼', 'Work', 'Add your work address', '＋')}
    ${row('', '➕', 'Add New Place', 'e.g. clinic, daughter\'s house')}`,
  addplace: () => `${top('Set Home')}
    ${search('search', '520 Tampines', true)}
    ${row('result1', '📍', 'Blk 520 Tampines St 52', 'Singapore 520520')}
    ${row('', '📍', 'Blk 520A Tampines Central 8', 'Singapore 521520')}
    ${keypad()}`,
  addplacesave: () => `${top('Set Home')}
    ${map('Home')}
    <div class="gd-sheet">
      ${row('', '🏠', 'Blk 520 Tampines St 52', 'Singapore 520520')}
      ${field('', 'Unit number (optional)', '#08-123')}
      ${btn('save', 'Save', 'primary')}
    </div>`,
  payhome: () => `${top('Payment', false)}
    <div class="gd-card wallet"><small>GrabPay Wallet</small><b>$0.00</b></div>
    ${row('methods', '💳', 'Payment Methods', 'Cards and cash', '›')}
    ${row('', '🧾', 'Transactions', '', '›')}
    ${tabs(GRAB_TABS, 'tab-payment')}`,
  methods: ({ added = false } = {}) => `${top('Payment Methods')}
    ${row('', '💵', 'Cash', 'For rides')}
    ${row('', '👛', 'GrabPay Wallet', '$0.00')}
    ${added ? row('', '💳', 'Visa •••• 4242', 'Added ✓') : ''}
    ${added ? '' : btn('add', '＋ Add Payment Method', 'ghost')}`,
  choose: () => `${top('Add Payment Method')}
    ${row('card', '💳', 'Credit / Debit Card', 'Visa, Mastercard, Amex', '›')}
    ${row('', '🏦', 'Other ways', 'Shown if available', '›')}`,
  cardform: () => `${top('Add Card')}
    <div class="gd-card"><small>VISA</small><b>4242 4242 4242 4242</b><small>TAN AH KOW · 08/29</small></div>
    ${field('', 'Card number', '4242 4242 4242 4242')}
    <div class="gd-two">${field('', 'Expiry (MM/YY)', '08/29')}${field('', 'CVV', '•••')}</div>
    ${btn('save', 'Save Card', 'primary')}`,
  bankotp: () => `${top('Your bank')}
    <p class="gd-p center">🏦<br>Your bank sent a one-time code by SMS to check it's really you.</p>
    <div class="gd-otp" data-id="otp">${'<span>•</span>'.repeat(6)}</div>
    ${btn('confirm', 'Confirm', 'primary')}`,
};

// ---- FairPrice ---------------------------------------------------------------------------------------

const FP_TABS = [['tab-home', '🏠', 'Home'], ['tab-cat', '🗂️', 'Categories'], ['tab-cart', '🛒', 'Cart'], ['tab-account', '👤', 'Account']];
const product = (id, icon, name, size, price, added = false) => `<div class="gd-product"><span class="gd-pic">${icon}</span><b>${name}</b><small>${size}</small><span class="gd-price">${price}</span>
  ${added ? '<div class="gd-qty small">−&nbsp; 1 &nbsp;＋</div>' : `<div class="gd-btn small" ${id ? `data-id="${id}"` : ''}>Add</div>`}</div>`;

const fairprice = {
  welcome: () => `<div class="gd-hero"><span class="gd-appicon big fp">🛒</span><b>Groceries delivered</b><small>Shop from home</small></div>
    ${btn('signup', 'Log in / Sign up', 'primary')}
    ${btn('guest', 'Browse as guest', 'ghost')}`,
  phone: () => `${top('Log in / Sign up')}
    <div class="gd-field"><small>Mobile number</small><span>🇸🇬 +65 &nbsp;9123 4567</span></div>
    ${btn('next', 'Continue', 'primary')}
    ${keypad()}`,
  details: () => `${top('Create account')}
    ${field('', 'Name', 'Tan Ah Kow')}
    ${field('', 'Email', 'ahkow@email.com')}
    ${row('', '☑️', 'I agree to the terms')}
    ${btn('create', 'Create Account', 'primary')}`,
  postal: () => `${top('Where should we deliver?')}
    ${field('postal', 'Postal code', '520520')}
    ${row('', '📍', 'Blk 520 Tampines St 52', 'Singapore 520520')}
    ${field('', 'Unit number', '#08-123')}
    ${btn('save', 'Save Address', 'primary')}`,
  home: ({ badge = 0 } = {}) => `<div class="gd-addr">🚚 Deliver to <b>520520</b></div>
    ${search('search', 'Search for products')}
    <div class="gd-banner fp">🔥 Weekly deals</div>
    <div class="gd-grid four">${tile('', '🥦', 'Fresh')}${tile('', '🥛', 'Dairy')}${tile('', '🍞', 'Bakery')}${tile('', '🧻', 'Household')}${tile('', '🍚', 'Rice & Oil')}${tile('', '🥫', 'Canned')}${tile('', '🧃', 'Drinks')}${tile('', '🧴', 'Health')}</div>
    ${tabs(FP_TABS.map(([id, icon, label]) => [id, id === 'tab-cart' && badge ? `${icon}<i class="gd-badge">${badge}</i>` : icon, label]), 'tab-home')}`,
  results: ({ added = false } = {}) => `${top('Search')}
    ${search('search', 'milk', true)}
    <div class="gd-products">
      ${product('add1', '🥛', 'Fresh Milk', '1 L', '$3.15', added)}
      ${product('', '🥛', 'Low Fat Milk', '1 L', '$3.40')}
      ${product('', '🥛', 'Soya Milk', '1 L', '$2.10')}
      ${product('', '🍼', 'Milk Powder', '900 g', '$29.90')}
    </div>
    ${added ? '<div class="gd-basketbar fp" data-id="cart">🛒 1 item · View cart <b>$3.15</b></div>' : ''}`,
  cart: () => `${top('Cart')}
    ${row('', '🥛', 'Fresh Milk 1 L', '−  1  ＋', '$3.15')}
    ${row('', '🍞', 'Wholemeal Bread', '−  1  ＋', '$2.95')}
    ${row('', '🥚', '10 Eggs', '−  1  ＋', '$3.60')}
    <p class="gd-note">🚚 Small orders may have a delivery fee. The app shows it before you pay.</p>
    <div class="gd-total">Subtotal <b>$9.70</b></div>
    ${btn('checkout', 'Checkout', 'primary')}`,
  slot: () => `${top('Choose a delivery time')}
    <div class="gd-days"><span>Fri<br>25</span><span class="on">Sat<br>26</span><span>Sun<br>27</span><span>Mon<br>28</span></div>
    ${row('', '⏰', '8am – 10am', 'Full')}
    ${row('slot2', '⏰', '10am – 12pm', 'Available')}
    ${row('', '⏰', '2pm – 4pm', 'Available')}
    ${row('', '⏰', '6pm – 8pm', 'Available')}
    ${btn('confirm', 'Confirm', 'primary')}`,
  checkout: () => `${top('Checkout')}
    ${row('address', '📍', 'Blk 520 Tampines St 52 #08-123', 'Delivery address · tap to change', '›')}
    ${row('slot', '⏰', 'Sat 26 Oct, 10am – 12pm', 'Delivery time', '›')}
    ${row('pay', '💳', 'Visa •••• 4242', 'Payment · tap to change', '›')}
    <div class="gd-total">Total <b>$9.70</b></div>
    ${btn('place', 'Place Order', 'primary')}`,
  done: () => `<div class="gd-hero"><span class="gd-appicon big ok">✅</span><b>Order placed!</b><small>Order #FP12345678</small></div>
    ${row('', '⏰', 'Sat 26 Oct, 10am – 12pm', 'We\'ll send updates by SMS and in the app')}
    ${row('', '🏠', 'Blk 520 Tampines St 52 #08-123', 'Someone needs to be home')}
    ${btn('track', 'Track Order', 'ghost')}`,
};

// ---- DBS digibank -------------------------------------------------------------------------------------
// DBS's own screenshots, from its help pages and its "Your simple guide to digibank" handbook (dbs.com.sg),
// cropped to the screen and saved as shots/dbs-<name>.jpg, 600 px wide. Each spot is a button to press:
// [left, top, width, height] as a percentage of the picture. The SMS and phone call screens stay drawn:
// they're the phone's own screens, not the bank's app.

export const SHOTS = {
  'dbs.start': { h: 1208, spots: { login: [14, 49.5, 17, 9], paynow: [73.5, 49.5, 17, 9], scan: [44, 61, 17, 9] } },
  'dbs.login': { h: 1188, warn: true, spots: { faceid: [84.5, 40.5, 14, 8], loginbtn: [6.7, 41.4, 76.7, 6.4] } },
  'dbs.home': { h: 1208, spots: { deposits: [2, 72.5, 96, 9], 'tab-pay': [34, 94.5, 20, 5] } },
  'dbs.balance': { h: 1139, spots: { deposits: [2, 42, 96, 7], account: [2, 57, 96, 11.5] } },
  'dbs.paynow': { h: 1256, spots: { mobile: [2, 29.5, 96, 7.5] } },
  'dbs.paynowto': { h: 1255, spots: { find: [4.7, 89.8, 90.7, 6.2], name: [2.5, 36, 50, 16] } },
  'dbs.amount': { h: 1246, spots: { amount: [2.3, 29.1, 95.7, 10.9] } },
  'dbs.review': { h: 1249, spots: { send: [4.7, 88.5, 90.7, 6.4] } },
  'dbs.sent': { h: 1248, spots: { done: [52.3, 91.7, 43, 6.2] } },
  'dbs.paytransfer': { h: 1248, spots: { bills: [0.7, 24, 23.3, 12.3], 'tab-pay': [19, 89.6, 21.3, 8] } },
  'dbs.bills': { h: 1251, spots: { add: [2.3, 20.3, 94.7, 8.6] } },
  'dbs.addbill': { h: 1248, spots: { biller: [4.5, 30.5, 91, 7.2], ref: [3.7, 45.4, 92.3, 5.8] } },
  'dbs.addbillreview': { h: 1249, spots: { addnow: [4.3, 88.1, 91.7, 5.8] } },
  'dbs.billsaved': { h: 1237, spots: { bill: [1.3, 33.2, 97.3, 11.5] } },
  'dbs.paybill': { h: 1234, spots: { amount: [3, 30.5, 94, 7] } },
  'dbs.billreview': { h: 1237, spots: { send: [4, 92.2, 92, 5.8] } },
  'dbs.billsent': { h: 1239, spots: {} },
  'dbs.scan': { h: 1110, spots: { qr: [22, 19, 56, 44] } },
  'dbs.scanpay': { h: 1237, spots: { merchant: [1, 16.5, 98, 7.5], amount: [0.5, 24.3, 99, 9.3], pay: [7, 91.3, 91.3, 5.3] } },
  'dbs.scanreview': { h: 1237, spots: { send: [7, 91.9, 91.3, 4.7] } },
  'dbs.scansent': { h: 1221, spots: {} },
};

const dbs = {
  sms: () => `${top('Messages')}
    <div class="gd-bubble"><small>+65 8xxx xxxx · 10:42</small>DBS: Your account has been LOCKED due to suspicious activity. Verify within 24 hours: <u class="gd-link">dbs-secure-verify.com</u></div>
    <div class="gd-actions two">${btn('delete', '🗑️ Delete', 'ghost')}${btn('report', '🚩 Report junk', 'ghost')}</div>
    <p class="gd-note">🚫 Scammers copy bank names. Banks don't send links for you to log in.</p>`,
  call: () => `<div class="gd-dial"><small>Calling</small><b>1800 339 6963</b><small>DBS Fraud Hotline · 24 hours</small>
      <div class="gd-ivr" data-id="ivr">🔢 Choose the option to activate <b>Safety Switch</b></div>
      <span class="gd-callbtn" data-id="call">📞</span></div>`,
};

export const SCREENS = {
  store, otp,
  ...Object.fromEntries(Object.entries(grab).map(([k, f]) => [`grab.${k}`, f])),
  ...Object.fromEntries(Object.entries(fairprice).map(([k, f]) => [`fp.${k}`, f])),
  ...Object.fromEntries(Object.entries(dbs).map(([k, f]) => [`dbs.${k}`, f])),
};

// ---- Lessons ------------------------------------------------------------------------------------------
// A step: { screen, opts? | shot, tap? (data-id to press; none means just look, then Next), en, zh, my, chips? }.
// Chips are short tips: a plain string reads the same in every language, an object has en, zh and my.

export const LANGS = [['en', 'EN'], ['zh', '中文'], ['my', 'မြန်မာ']];

const GRAB_STORE = { app: 'Grab', icon: '🚗', color: '#00a651' };
const FP_STORE = { app: 'FairPrice', icon: '🛒', color: '#1d4ed8' };
const DBS_STORE = { app: 'DBS digibank', icon: '🏦', color: '#c8102e' };
const NO_OTP = { en: '🤫 Never tell anyone this code', zh: '🤫 不要把验证码告诉任何人', my: '🤫 ဤကုဒ်ကို မည်သူ့ကိုမျှ မပြောပါနှင့်' };

export const APPS = [
  {
    id: 'grab', name: 'Grab', emoji: '🚗', color: '#00a651',
    en: 'Book a car, order food', zh: '叫车、叫外卖', my: 'ကားခေါ်ရန်၊ အစားအစာ မှာရန်',
    lessons: [
      {
        id: 'grab-account', emoji: '📲', en: 'Create an account', zh: '注册账号', my: 'အကောင့်ဖွင့်ခြင်း',
        steps: [
          { screen: 'store', opts: GRAB_STORE, tap: 'get', en: 'Open the App Store or Play Store. Search "Grab". Tap Get.', zh: '打开 App Store 或 Play Store，搜索 “Grab”，点 “Get”（下载）。', my: 'App Store သို့မဟုတ် Play Store ကို ဖွင့်ပါ။ "Grab" ကို ရှာပြီး Get ကို နှိပ်ပါ။' },
          { screen: 'grab.welcome', tap: 'mobile', en: 'Open Grab. Tap Continue with Mobile Number.', zh: '打开 Grab，点 “Continue with Mobile Number”（用手机号码）。', my: 'Grab ကို ဖွင့်ပါ။ Continue with Mobile Number ကို နှိပ်ပါ။' },
          { screen: 'grab.phone', tap: 'next', en: 'Type your mobile number. Tap Next.', zh: '输入你的手机号码，点 “Next”（下一步）。', my: 'သင့်ဖုန်းနံပါတ်ကို ရိုက်ထည့်ပါ။ Next ကို နှိပ်ပါ။' },
          { screen: 'otp', opts: { who: 'Grab' }, tap: 'otp', en: 'You get an SMS with a code. Type the code in.', zh: '你会收到一条短信验证码，把号码输入进去。', my: 'ကုဒ်ပါသော SMS တစ်စောင် ရောက်လာပါမည်။ ထိုကုဒ်ကို ရိုက်ထည့်ပါ။', chips: [NO_OTP] },
          { screen: 'grab.name', tap: 'done', en: 'Type your name. Tap Done.', zh: '输入你的名字，点 “Done”（完成）。', my: 'သင့်အမည်ကို ရိုက်ထည့်ပါ။ Done ကို နှိပ်ပါ။' },
          { screen: 'grab.home', en: 'You\'re in! This is the home screen.', zh: '完成了！这是主页。', my: 'ပြီးပါပြီ။ ဤသည်မှာ ပင်မစာမျက်နှာ ဖြစ်ပါသည်။' },
        ],
      },
      {
        id: 'grab-ride', emoji: '🚗', en: 'Book a ride', zh: '叫车', my: 'ကားခေါ်ခြင်း',
        steps: [
          { screen: 'grab.home', tap: 'transport', en: 'Tap Transport.', zh: '点 “Transport”（交通）。', my: 'Transport ကို နှိပ်ပါ။' },
          { screen: 'grab.whereto', tap: 'search', en: 'Tap Where to?', zh: '点 “Where to?”（去哪里？）。', my: 'Where to? ကို နှိပ်ပါ။' },
          { screen: 'grab.results', tap: 'result1', en: 'Type where you\'re going. Tap the right place.', zh: '输入要去的地方，点正确的那一个。', my: 'သွားမည့်နေရာကို ရိုက်ထည့်ပါ။ မှန်ကန်သော နေရာကို နှိပ်ပါ။' },
          { screen: 'grab.pickup', tap: 'confirm', en: 'Check the pin is where you are. Tap Confirm Pick-up.', zh: '确认地图上的针在你的位置，点 “Confirm Pick-up”（确认上车地点）。', my: 'မြေပုံပေါ်ရှိ အမှတ်အသားသည် သင်ရှိရာနေရာ ဟုတ်မဟုတ် စစ်ပါ။ Confirm Pick-up ကို နှိပ်ပါ။' },
          { screen: 'grab.cartypes', tap: 'car-just', en: 'Choose a car. The price is shown on the right.', zh: '选一种车，右边会显示价钱。', my: 'ကားအမျိုးအစား ရွေးပါ။ ညာဘက်တွင် ဈေးနှုန်း ပြထားပါသည်။' },
          { screen: 'grab.cartypes', tap: 'pay', en: 'Check how you\'ll pay. Tap to change, for example to Cash.', zh: '看看付款方式，点一下可以更改，例如改成现金（Cash）。', my: 'ငွေပေးချေမည့်နည်းကို စစ်ပါ။ ပြောင်းလိုလျှင် နှိပ်ပါ၊ ဥပမာ Cash (ငွေသား)။' },
          { screen: 'grab.cartypes', tap: 'book', en: 'Tap Book.', zh: '点 “Book”（预订）。', my: 'Book ကို နှိပ်ပါ။' },
          { screen: 'grab.finding', en: 'Wait a moment while Grab finds you a driver.', zh: '稍等，Grab 正在帮你找司机。', my: 'Grab က ယာဉ်မောင်း ရှာနေစဉ် ခဏ စောင့်ပါ။' },
          { screen: 'grab.driver', tap: 'plate', en: 'Before you get in, check the car plate matches!', zh: '上车前，一定要核对车牌号码！', my: 'ကားမတက်မီ ကားနံပါတ်ပြား ကိုက်ညီမှု ရှိမရှိ စစ်ပါ။', chips: ['🔍 SGX 1234 A', '🚗 White Toyota Prius'] },
          { screen: 'grab.driver', tap: 'call', en: 'Can\'t find the car? Call or chat with the driver here.', zh: '找不到车？可以在这里打电话或发信息给司机。', my: 'ကားကို ရှာမတွေ့လျှင် ဤနေရာမှ ယာဉ်မောင်းကို ဖုန်းခေါ်ပါ သို့မဟုတ် စာပို့ပါ။' },
        ],
      },
      {
        id: 'grab-food', emoji: '🍔', en: 'Order food delivery', zh: '叫外卖', my: 'အစားအစာ မှာယူခြင်း',
        steps: [
          { screen: 'grab.home', tap: 'food', en: 'Tap Food.', zh: '点 “Food”（美食）。', my: 'Food ကို နှိပ်ပါ။' },
          { screen: 'grab.foodhome', tap: 'shop1', en: 'Search for a dish or shop, or tap one you like.', zh: '搜索想吃的东西或店家，或直接点一家。', my: 'အစားအစာ သို့မဟုတ် ဆိုင်ကို ရှာပါ၊ သို့မဟုတ် နှစ်သက်သော ဆိုင်ကို နှိပ်ပါ။' },
          { screen: 'grab.restaurant', tap: 'dish1', en: 'Tap a dish.', zh: '点一样食物。', my: 'ဟင်းတစ်ခုကို နှိပ်ပါ။' },
          { screen: 'grab.dish', tap: 'add', en: 'Choose your options. Tap Add to Basket.', zh: '选好选项，点 “Add to Basket”（加入购物篮）。', my: 'ရွေးချယ်စရာများ ရွေးပြီး Add to Basket ကို နှိပ်ပါ။' },
          { screen: 'grab.restaurant', opts: { basket: true }, tap: 'basket', en: 'Tap the basket at the bottom.', zh: '点下面的购物篮。', my: 'အောက်ခြေရှိ ခြင်းတောင်းကို နှိပ်ပါ။' },
          { screen: 'grab.checkout', tap: 'address', en: 'Check the delivery address and unit number.', zh: '核对送餐地址和门牌号码。', my: 'ပို့ရမည့် လိပ်စာနှင့် အခန်းနံပါတ်ကို စစ်ပါ။' },
          { screen: 'grab.checkout', tap: 'pay', en: 'Check how you\'ll pay.', zh: '核对付款方式。', my: 'ငွေပေးချေမည့်နည်းကို စစ်ပါ။' },
          { screen: 'grab.checkout', tap: 'place', en: 'Tap Place Order.', zh: '点 “Place Order”（下单）。', my: 'Place Order ကို နှိပ်ပါ။' },
          { screen: 'grab.tracking', en: 'Watch your food on its way. The rider brings it to your door.', zh: '可以看到食物送到哪里了，骑手会送到你家门口。', my: 'အစားအစာ လာနေသည်ကို ကြည့်နိုင်ပါသည်။ ပို့ဆောင်သူက သင့်တံခါးဝအထိ ယူလာပါမည်။' },
        ],
      },
      {
        id: 'grab-places', emoji: '⭐', en: 'Save your places', zh: '保存常去的地方', my: 'မကြာခဏ သွားသောနေရာများ သိမ်းခြင်း',
        steps: [
          { screen: 'grab.home', tap: 'tab-account', en: 'Tap Account at the bottom.', zh: '点下面的 “Account”（账号）。', my: 'အောက်ခြေရှိ Account ကို နှိပ်ပါ။' },
          { screen: 'grab.account', tap: 'saved', en: 'Tap Saved Places.', zh: '点 “Saved Places”（保存的地点）。', my: 'Saved Places ကို နှိပ်ပါ။' },
          { screen: 'grab.saved', tap: 'home', en: 'Tap Home.', zh: '点 “Home”（家）。', my: 'Home ကို နှိပ်ပါ။' },
          { screen: 'grab.addplace', tap: 'result1', en: 'Type your address. Tap the right one.', zh: '输入你的地址，点正确的那一个。', my: 'သင့်လိပ်စာကို ရိုက်ထည့်ပါ။ မှန်ကန်သော လိပ်စာကို နှိပ်ပါ။' },
          { screen: 'grab.addplacesave', tap: 'save', en: 'Add your unit number. Tap Save.', zh: '加上门牌号码，点 “Save”（保存）。', my: 'အခန်းနံပါတ် ထည့်ပါ။ Save ကို နှိပ်ပါ။' },
          { screen: 'grab.whereto', opts: { saved: true }, tap: 'savedhome', en: 'Next time, just tap Home. No typing!', zh: '下次直接点 “Home”，不用再打字！', my: 'နောက်တစ်ကြိမ်တွင် Home ကိုသာ နှိပ်ပါ။ စာရိုက်စရာ မလိုပါ။', chips: [{ en: '💡 Add your clinic or your children\'s homes too', zh: '💡 也可以加诊所或孩子的家', my: '💡 ဆေးခန်း သို့မဟုတ် သားသမီးများ၏ အိမ်ကိုလည်း ထည့်နိုင်ပါသည်' }] },
        ],
      },
      {
        id: 'grab-pay', emoji: '💳', en: 'Add a payment card', zh: '添加付款卡', my: 'ငွေပေးကတ် ထည့်ခြင်း',
        steps: [
          { screen: 'grab.home', tap: 'tab-payment', en: 'Tap Payment at the bottom.', zh: '点下面的 “Payment”（付款）。', my: 'အောက်ခြေရှိ Payment ကို နှိပ်ပါ။' },
          { screen: 'grab.payhome', tap: 'methods', en: 'Tap Payment Methods.', zh: '点 “Payment Methods”（付款方式）。', my: 'Payment Methods ကို နှိပ်ပါ။' },
          { screen: 'grab.methods', tap: 'add', en: 'Tap Add Payment Method.', zh: '点 “Add Payment Method”（添加付款方式）。', my: 'Add Payment Method ကို နှိပ်ပါ။' },
          { screen: 'grab.choose', tap: 'card', en: 'Tap Credit / Debit Card.', zh: '点 “Credit / Debit Card”（信用卡 / 借记卡）。', my: 'Credit / Debit Card ကို နှိပ်ပါ။' },
          { screen: 'grab.cardform', tap: 'save', en: 'Type the card number, expiry date and CVV. Tap Save Card.', zh: '输入卡号、有效期和 CVV，点 “Save Card”（保存）。', my: 'ကတ်နံပါတ်၊ သက်တမ်းကုန်ရက်နှင့် CVV ကို ရိုက်ထည့်ပါ။ Save Card ကို နှိပ်ပါ။', chips: [{ en: '💳 CVV = 3 numbers on the back', zh: '💳 CVV＝卡背面的 3 个数字', my: '💳 CVV = ကတ်နောက်ကျောရှိ ဂဏန်း ၃ လုံး' }] },
          { screen: 'grab.bankotp', tap: 'otp', en: 'Your bank may SMS you a code. Type it in to confirm.', zh: '银行可能会发短信验证码，输入后确认。', my: 'သင့်ဘဏ်က ကုဒ်ကို SMS ဖြင့် ပို့နိုင်ပါသည်။ အတည်ပြုရန် ရိုက်ထည့်ပါ။' },
          { screen: 'grab.methods', opts: { added: true }, en: 'Done! Your card is saved. For rides, you can still choose Cash.', zh: '完成！卡已保存。叫车时还是可以选现金。', my: 'ပြီးပါပြီ။ ကတ်ကို သိမ်းပြီးပါပြီ။ ကားစီးရာတွင် ငွေသားကိုလည်း ရွေးနိုင်ပါသေးသည်။' },
        ],
      },
      {
        id: 'grab-cars', emoji: '♿', en: 'Car types & wheelchairs', zh: '车种和轮椅', my: 'ကားအမျိုးအစားနှင့် ဘီးတပ်ကုလားထိုင်',
        steps: [
          { screen: 'grab.cartypes', tap: 'car-just', en: 'JustGrab: the nearest taxi or car. You see a fixed price first.', zh: 'JustGrab：最近的德士或私家车，先显示固定价钱。', my: 'JustGrab: အနီးဆုံး တက္ကစီ သို့မဟုတ် ကား။ သတ်မှတ်ဈေးနှုန်းကို ကြိုတင် မြင်ရပါသည်။', chips: ['👥 4', { en: '💲 Fixed price', zh: '💲 固定价', my: '💲 ဈေးသတ်မှတ်ထား' }] },
          { screen: 'grab.cartypes', tap: 'car-taxi', en: 'Standard Taxi: a normal taxi. You pay by the meter.', zh: 'Standard Taxi：普通德士，按咪表收费。', my: 'Standard Taxi: သာမန် တက္ကစီ။ မီတာအတိုင်း ပေးရပါသည်။', chips: ['👥 4', { en: '🧾 Meter', zh: '🧾 咪表', my: '🧾 မီတာ' }] },
          { screen: 'grab.cartypes', opts: { scroll: true }, tap: 'car-6', en: '6-Seater: a bigger car for family outings or lots of bags.', zh: '6-Seater：大车，适合一家人出门或行李多。', my: '6-Seater: မိသားစုခရီး သို့မဟုတ် အိတ်များများအတွက် ကားကြီး။', chips: ['👥 6', '🧳🧳'] },
          { screen: 'grab.cartypes', opts: { scroll: true }, tap: 'car-family', en: 'GrabFamily: comes with a child car seat.', zh: 'GrabFamily：车上有儿童安全座椅。', my: 'GrabFamily: ကလေးထိုင်ခုံ ပါပါသည်။', chips: [{ en: '👶 Child seat', zh: '👶 儿童座椅', my: '👶 ကလေးထိုင်ခုံ' }] },
          { screen: 'grab.cartypes', opts: { scroll: true }, tap: 'car-assist', en: 'GrabAssist: drivers trained to help seniors. Room for a foldable wheelchair or walker.', zh: 'GrabAssist：司机受过训练，会帮助乐龄人士上下车，有空间放可折叠的轮椅或助行器。', my: 'GrabAssist: သက်ကြီးရွယ်အိုများကို ကူညီရန် လေ့ကျင့်ထားသော ယာဉ်မောင်းများ။ ခေါက်နိုင်သော ဘီးတပ်ကုလားထိုင် သို့မဟုတ် လမ်းလျှောက်အထောက်အကူ ထည့်စရာ နေရာရှိပါသည်။', chips: [{ en: '♿ Foldable wheelchair', zh: '♿ 可折叠轮椅', my: '♿ ခေါက်နိုင်သော ဘီးတပ်ကုလားထိုင်' }, { en: '🦯 Walker', zh: '🦯 助行器', my: '🦯 လမ်းလျှောက်အထောက်အကူ' }, { en: '🤝 Help to get in', zh: '🤝 协助上车', my: '🤝 ကားတက်ရန် ကူညီပေး' }] },
          { screen: 'grab.cartypes', opts: { scroll: true }, tap: 'car-premium', en: 'Premium: a bigger, more comfortable car. Costs more.', zh: 'Premium：更大、更舒适的车，价钱比较贵。', my: 'Premium: ပိုကြီးပြီး ပိုသက်တောင့်သက်သာ ရှိသော ကား။ ဈေးပိုများပါသည်။', chips: ['👥 4', { en: '💺 Comfort', zh: '💺 舒适', my: '💺 သက်တောင့်သက်သာ' }] },
          { screen: 'grab.cartypes', opts: { scroll: true }, en: 'Wheelchair that can\'t fold? Look for a wheelchair-accessible option in the app, or call a wheelchair-accessible taxi. Car names change, and the app only shows what\'s near you.', zh: '轮椅不能折叠？在应用程序里找无障碍（wheelchair-accessible）车，或打电话叫可载轮椅的德士。车种名称会变，应用程序只显示你附近有的。', my: 'ခေါက်၍မရသော ဘီးတပ်ကုလားထိုင်လား။ အက်ပ်ထဲတွင် wheelchair-accessible ရွေးချယ်စရာကို ရှာပါ၊ သို့မဟုတ် ဘီးတပ်ကုလားထိုင် တင်နိုင်သော တက္ကစီကို ဖုန်းဖြင့် ခေါ်ပါ။ ကားအမည်များ ပြောင်းလဲနိုင်ပြီး အက်ပ်က သင့်အနီးရှိသည်ကိုသာ ပြပါသည်။' },
        ],
      },
      {
        id: 'grab-safe', emoji: '🛡️', en: 'Stay safe', zh: '安全须知', my: 'ဘေးကင်းရေး',
        steps: [
          { screen: 'grab.driver', tap: 'plate', en: 'Always check the car plate before you get in.', zh: '上车前一定要核对车牌。', my: 'ကားမတက်မီ ကားနံပါတ်ပြားကို အမြဲ စစ်ပါ။' },
          { screen: 'grab.driver', tap: 'share', en: 'Tap Share ride so family can see where you are.', zh: '点 “Share ride”（分享行程），家人就能看到你在哪里。', my: 'Share ride ကို နှိပ်ပါ။ မိသားစုက သင်ရှိရာကို မြင်နိုင်ပါမည်။' },
          { screen: 'grab.driver', tap: 'sos', en: 'In an emergency, tap the Emergency button.', zh: '遇到紧急情况，点紧急按钮。', my: 'အရေးပေါ် အခြေအနေတွင် Emergency ခလုတ်ကို နှိပ်ပါ။' },
          { screen: 'otp', opts: { who: 'Grab' }, tap: 'otp', en: 'Never give your SMS code to anyone, even if they say they\'re from Grab or the bank.', zh: '绝对不要把短信验证码给任何人，就算对方说是 Grab 或银行的人。', my: 'Grab သို့မဟုတ် ဘဏ်မှဟု ပြောလျှင်ပင် သင့် SMS ကုဒ်ကို မည်သူ့ကိုမျှ မပေးပါနှင့်။', chips: ['🚫 OTP', '📞 ScamShield 1799'] },
        ],
      },
    ],
  },
  {
    id: 'fairprice', name: 'FairPrice', emoji: '🛒', color: '#1d4ed8',
    en: 'Order groceries to your door', zh: '网上买菜，送到家', my: 'ကုန်စုံ မှာယူပြီး အိမ်အရောက် ပို့ခြင်း',
    lessons: [
      {
        id: 'fp-account', emoji: '📲', en: 'Create an account', zh: '注册账号', my: 'အကောင့်ဖွင့်ခြင်း',
        steps: [
          { screen: 'store', opts: FP_STORE, tap: 'get', en: 'Open the App Store or Play Store. Search "FairPrice". Tap Get.', zh: '打开 App Store 或 Play Store，搜索 “FairPrice”，点 “Get”（下载）。', my: 'App Store သို့မဟုတ် Play Store ကို ဖွင့်ပါ။ "FairPrice" ကို ရှာပြီး Get ကို နှိပ်ပါ။' },
          { screen: 'fp.welcome', tap: 'signup', en: 'Open FairPrice. Tap Log in / Sign up.', zh: '打开 FairPrice，点 “Log in / Sign up”（登录 / 注册）。', my: 'FairPrice ကို ဖွင့်ပါ။ Log in / Sign up ကို နှိပ်ပါ။' },
          { screen: 'fp.phone', tap: 'next', en: 'Type your mobile number. Tap Continue.', zh: '输入手机号码，点 “Continue”（继续）。', my: 'သင့်ဖုန်းနံပါတ်ကို ရိုက်ထည့်ပါ။ Continue ကို နှိပ်ပါ။' },
          { screen: 'otp', opts: { who: 'FairPrice' }, tap: 'otp', en: 'Type in the code from the SMS.', zh: '输入短信里的验证码。', my: 'SMS ထဲရှိ ကုဒ်ကို ရိုက်ထည့်ပါ။', chips: [NO_OTP] },
          { screen: 'fp.details', tap: 'create', en: 'Type your name and email. Tap Create Account.', zh: '输入名字和电邮，点 “Create Account”（创建账号）。', my: 'အမည်နှင့် အီးမေးလ်ကို ရိုက်ထည့်ပါ။ Create Account ကို နှိပ်ပါ။' },
          { screen: 'fp.postal', tap: 'save', en: 'Type your postal code and unit number. Tap Save Address.', zh: '输入邮区编号和门牌号码，点 “Save Address”（保存地址）。', my: 'စာတိုက်သင်္ကေတ (postal code) နှင့် အခန်းနံပါတ်ကို ရိုက်ထည့်ပါ။ Save Address ကို နှိပ်ပါ။' },
          { screen: 'fp.home', en: 'You\'re ready to shop!', zh: '可以开始买东西了！', my: 'ဈေးဝယ်ရန် အဆင်သင့် ဖြစ်ပါပြီ။' },
        ],
      },
      {
        id: 'fp-order', emoji: '🛒', en: 'Order groceries for delivery', zh: '网上买菜送到家', my: 'ကုန်စုံ မှာပြီး အိမ်အရောက် ပို့ခိုင်းခြင်း',
        steps: [
          { screen: 'fp.home', tap: 'search', en: 'Tap the search bar.', zh: '点上面的搜索栏。', my: 'ရှာဖွေရေး ဘားကို နှိပ်ပါ။' },
          { screen: 'fp.results', tap: 'add1', en: 'Type what you want, e.g. milk. Tap Add.', zh: '输入要买的东西，例如 milk（牛奶），点 “Add”（加入）。', my: 'လိုချင်သည်ကို ရိုက်ထည့်ပါ၊ ဥပမာ milk (နွားနို့)။ Add ကို နှိပ်ပါ။' },
          { screen: 'fp.results', opts: { added: true }, tap: 'cart', en: 'Tap ＋ for more. Add everything you need, then tap the cart.', zh: '点 ＋ 可以多买。买齐后，点购物车。', my: 'ပိုလိုလျှင် ＋ ကို နှိပ်ပါ။ လိုသမျှ ထည့်ပြီးနောက် ဈေးခြင်းကို နှိပ်ပါ။' },
          { screen: 'fp.cart', tap: 'checkout', en: 'Check your items. Tap Checkout.', zh: '核对买的东西，点 “Checkout”（结账）。', my: 'ပစ္စည်းများကို စစ်ပါ။ Checkout ကို နှိပ်ပါ။' },
          { screen: 'fp.slot', tap: 'slot2', en: 'Choose a day and a time when you\'ll be home.', zh: '选一个你在家的日子和时间。', my: 'သင် အိမ်မှာ ရှိမည့် နေ့နှင့် အချိန်ကို ရွေးပါ။' },
          { screen: 'fp.checkout', tap: 'address', en: 'Check the delivery address.', zh: '核对送货地址。', my: 'ပို့ရမည့် လိပ်စာကို စစ်ပါ။' },
          { screen: 'fp.checkout', tap: 'pay', en: 'Check how you\'ll pay.', zh: '核对付款方式。', my: 'ငွေပေးချေမည့်နည်းကို စစ်ပါ။' },
          { screen: 'fp.checkout', tap: 'place', en: 'Tap Place Order.', zh: '点 “Place Order”（下单）。', my: 'Place Order ကို နှိပ်ပါ။' },
          { screen: 'fp.done', en: 'Done! Your groceries come at the time you chose. Someone needs to be home.', zh: '完成！东西会在你选的时间送到，家里要有人。', my: 'ပြီးပါပြီ။ သင်ရွေးထားသော အချိန်တွင် ပစ္စည်းများ ရောက်လာပါမည်။ အိမ်တွင် လူရှိရန် လိုပါသည်။' },
        ],
      },
    ],
  },
  {
    id: 'dbs', name: 'DBS digibank', emoji: '🏦', color: '#c8102e',
    en: 'Check your money, PayNow, scan to pay, bills, avoid scams', zh: '查余额、PayNow、扫码付款、缴账单、防诈骗', my: 'ငွေစစ်ရန်၊ PayNow၊ QR ဖြင့်ပေးရန်၊ ဘေလ်ပေးရန်၊ လိမ်လည်မှု ရှောင်ရန်',
    lessons: [
      {
        id: 'dbs-balance', emoji: '💰', en: 'Log in and check your money', zh: '登录和查余额', my: 'ဝင်ရောက်ပြီး ငွေစစ်ခြင်း',
        steps: [
          { screen: 'store', opts: DBS_STORE, tap: 'get', en: 'Get the official DBS digibank app from the App Store or Play Store. Check the maker is DBS Bank.', zh: '在 App Store 或 Play Store 下载官方的 DBS digibank 应用程序，确认开发者是 DBS Bank。', my: 'App Store သို့မဟုတ် Play Store မှ တရားဝင် DBS digibank အက်ပ်ကို ရယူပါ။ ထုတ်လုပ်သူမှာ DBS Bank ဖြစ်ကြောင်း စစ်ပါ။' },
          { shot: 'dbs.start', tap: 'login', en: 'Open the app. Tap Log In.', zh: '打开应用程序，点 “Log In”（登录）。', my: 'အက်ပ်ကို ဖွင့်ပါ။ Log In ကို နှိပ်ပါ။' },
          { shot: 'dbs.login', tap: 'faceid', en: 'Tap the face icon to use Face ID or your fingerprint. Or type your User ID and PIN, then tap LOGIN.', zh: '点脸部图标，用面部识别或指纹登录；或输入 User ID 和 PIN，再点 “LOGIN”。', my: 'Face ID သို့မဟုတ် လက်ဗွေဖြင့် ဝင်ရန် မျက်နှာပုံ အိုင်ကွန်ကို နှိပ်ပါ။ သို့မဟုတ် User ID နှင့် PIN ရိုက်ထည့်ပြီး LOGIN ကို နှိပ်ပါ။', chips: [{ en: '🔒 Never log in from a link', zh: '🔒 绝不从链接登录', my: '🔒 လင့်ခ်မှ ဘယ်တော့မှ မဝင်ပါနှင့်' }] },
          { shot: 'dbs.home', tap: 'deposits', en: 'Tap Deposits to see your accounts.', zh: '点 “Deposits”（存款）查看你的户口。', my: 'သင့်အကောင့်များကို ကြည့်ရန် Deposits ကို နှိပ်ပါ။' },
          { shot: 'dbs.balance', tap: 'account', en: 'This is your balance. Check it now and then. If you see something you don\'t know, call the bank straight away.', zh: '这就是你的余额。要常常查看，看到不认识的交易，马上打电话给银行。', my: 'ဤသည်မှာ သင့်လက်ကျန်ငွေ ဖြစ်ပါသည်။ ရံဖန်ရံခါ စစ်ပါ။ မသိသော အရာကို တွေ့လျှင် ဘဏ်ကို ချက်ချင်း ဖုန်းဆက်ပါ။', chips: [{ en: '💡 Peek Balance on the first screen shows your balance without logging in', zh: '💡 首页的 “Peek Balance” 不用登录也能看余额', my: '💡 ပထမစာမျက်နှာရှိ Peek Balance ဖြင့် မဝင်ဘဲ လက်ကျန်ငွေကို ကြည့်နိုင်ပါသည်' }] },
        ],
      },
      {
        id: 'dbs-paynow', emoji: '📲', en: 'Send money with PayNow', zh: '用 PayNow 转账', my: 'PayNow ဖြင့် ငွေပို့ခြင်း',
        steps: [
          { shot: 'dbs.start', tap: 'paynow', en: 'Open the app. Tap PayNow.', zh: '打开应用程序，点 “PayNow”。', my: 'အက်ပ်ကို ဖွင့်ပါ။ PayNow ကို နှိပ်ပါ။' },
          { shot: 'dbs.login', tap: 'faceid', en: 'Log in with your face, fingerprint or PIN.', zh: '用面部、指纹或 PIN 登录。', my: 'မျက်နှာ၊ လက်ဗွေ သို့မဟုတ် PIN ဖြင့် ဝင်ပါ။' },
          { shot: 'dbs.paynow', tap: 'mobile', en: 'Tap PayNow to Mobile.', zh: '点 “PayNow to Mobile”（转到手机号码）。', my: 'PayNow to Mobile ကို နှိပ်ပါ။' },
          { shot: 'dbs.paynowto', tap: 'find', en: 'Type the person\'s mobile number. Tap Next.', zh: '输入对方的手机号码，点 “Next”（下一步）。', my: 'လက်ခံမည့်သူ၏ ဖုန်းနံပါတ်ကို ရိုက်ထည့်ပါ။ Next ကို နှိပ်ပါ။' },
          { shot: 'dbs.paynowto', tap: 'name', en: 'Stop and check the Name on PayNow! Is it the person you know?', zh: '停一下，核对 “Name on PayNow” 的名字！是你认识的那个人吗？', my: 'ရပ်ပြီး Name on PayNow ကို စစ်ပါ။ သင်သိသော လူ ဟုတ်ပါသလား။', chips: [{ en: '❌ Wrong name? Don\'t send', zh: '❌ 名字不对？不要转', my: '❌ အမည်မှားလျှင် မပို့ပါနှင့်' }] },
          { shot: 'dbs.amount', tap: 'amount', en: 'Type the amount. Add a comment if you like. Tap Next.', zh: '输入金额，可以加备注，然后点 “Next”。', my: 'ငွေပမာဏကို ရိုက်ထည့်ပါ။ လိုလျှင် မှတ်ချက် ထည့်ပါ။ Next ကို နှိပ်ပါ။' },
          { shot: 'dbs.review', tap: 'send', en: 'Let\'s review! Check the name and amount once more. Tap Transfer now.', zh: '再核对一次名字和金额，点 “Transfer now”（立即转账）。', my: 'အမည်နှင့် ပမာဏကို နောက်တစ်ကြိမ် စစ်ပါ။ Transfer now ကို နှိပ်ပါ။', chips: [{ en: '⚠️ Money sent usually can\'t come back', zh: '⚠️ 转出的钱通常拿不回来', my: '⚠️ ပို့ပြီးသော ငွေ ပြန်ရခဲပါသည်' }] },
          { shot: 'dbs.sent', tap: 'done', en: 'Successful! The money arrives in seconds. Tap Done.', zh: '成功了！钱几秒钟就到。点 “Done”（完成）。', my: 'အောင်မြင်ပါပြီ။ ငွေသည် စက္ကန့်အနည်းငယ်အတွင်း ရောက်ပါသည်။ Done ကို နှိပ်ပါ။' },
        ],
      },
      {
        id: 'dbs-scan', emoji: '🔳', en: 'Scan a QR code to pay', zh: '扫码付款', my: 'QR ကုဒ် စကင်ဖတ်ပြီး ငွေပေးခြင်း',
        steps: [
          { shot: 'dbs.start', tap: 'scan', en: 'At the stall, open the app. Tap Scan & Pay.', zh: '在摊位前打开应用程序，点 “Scan & Pay”（扫码付款）。', my: 'ဆိုင်ရှေ့တွင် အက်ပ်ကို ဖွင့်ပါ။ Scan & Pay ကို နှိပ်ပါ။' },
          { shot: 'dbs.login', tap: 'faceid', en: 'Log in with your face, fingerprint or PIN.', zh: '用面部、指纹或 PIN 登录。', my: 'မျက်နှာ၊ လက်ဗွေ သို့မဟုတ် PIN ဖြင့် ဝင်ပါ။' },
          { shot: 'dbs.scan', tap: 'qr', en: 'Point the camera at the shop\'s QR code and hold still.', zh: '把相机对准店家的 QR 码，拿稳。', my: 'ကင်မရာကို ဆိုင်၏ QR ကုဒ်ဆီ ချိန်ပြီး ငြိမ်ငြိမ် ကိုင်ထားပါ။', chips: [{ en: '🔍 A sticker stuck over the QR? Ask the stall first', zh: '🔍 QR 码上贴了贴纸？先问摊主', my: '🔍 QR ပေါ်တွင် စတစ်ကာ ကပ်ထားလား။ ဆိုင်ရှင်ကို အရင် မေးပါ' }] },
          { shot: 'dbs.scanpay', tap: 'merchant', en: 'Check the name is the shop in front of you.', zh: '核对名字是不是你面前的这家店。', my: 'အမည်သည် သင့်ရှေ့ရှိ ဆိုင် ဟုတ်မဟုတ် စစ်ပါ။' },
          { shot: 'dbs.scanpay', tap: 'amount', en: 'Type the amount if it isn\'t filled in. Check it.', zh: '如果金额没有自动出现，就输入金额，再核对一次。', my: 'ပမာဏ မပါလျှင် ရိုက်ထည့်ပါ။ ပြန်စစ်ပါ။' },
          { shot: 'dbs.scanpay', tap: 'pay', en: 'Tap PAY NOW.', zh: '点 “PAY NOW”（付款）。', my: 'PAY NOW ကို နှိပ်ပါ။' },
          { shot: 'dbs.scanreview', tap: 'send', en: 'Check the name and amount once more. Tap TRANSFER NOW.', zh: '再核对一次名字和金额，点 “TRANSFER NOW”（立即转账）。', my: 'အမည်နှင့် ပမာဏကို နောက်တစ်ကြိမ် စစ်ပါ။ TRANSFER NOW ကို နှိပ်ပါ။' },
          { shot: 'dbs.scansent', en: 'Paid! Show this screen to the stall owner.', zh: '付好了！把这个画面给摊主看。', my: 'ပေးပြီးပါပြီ။ ဤစာမျက်နှာကို ဆိုင်ရှင်အား ပြပါ။' },
        ],
      },
      {
        id: 'dbs-bills', emoji: '🧾', en: 'Pay a bill', zh: '缴付账单', my: 'ဘေလ် ပေးဆောင်ခြင်း',
        steps: [
          { shot: 'dbs.home', tap: 'tab-pay', en: 'Log in. Tap Pay & Transfer at the bottom.', zh: '登录后，点下面的 “Pay & Transfer”（付款与转账）。', my: 'ဝင်ပြီးနောက် အောက်ခြေရှိ Pay & Transfer ကို နှိပ်ပါ။' },
          { shot: 'dbs.paytransfer', tap: 'bills', en: 'Tap Bills, Cards & GIRO.', zh: '点 “Bills, Cards & GIRO”（账单、信用卡和 GIRO）。', my: 'Bills, Cards & GIRO ကို နှိပ်ပါ။' },
          { shot: 'dbs.bills', tap: 'add', en: 'The first time, tap Add a new biller.', zh: '第一次要点 “Add a new biller”（添加收款机构）。', my: 'ပထမဆုံးအကြိမ်တွင် Add a new biller ကို နှိပ်ပါ။' },
          { shot: 'dbs.addbill', tap: 'biller', en: 'Choose who the bill is from, e.g. SP Group or your insurer.', zh: '选择账单是谁寄来的，例如 SP Group 或保险公司。', my: 'ဘေလ် ပို့သူကို ရွေးပါ၊ ဥပမာ SP Group သို့မဟုတ် သင့်အာမခံကုမ္ပဏီ။' },
          { shot: 'dbs.addbill', tap: 'ref', en: 'Copy the bill reference number from your bill. Tap Next.', zh: '照账单输入账单参考号码（Bill reference），点 “Next”。', my: 'ဘေလ်ပေါ်မှ ကိုးကားနံပါတ် (Bill reference) ကို ကူးထည့်ပါ။ Next ကို နှိပ်ပါ။', chips: [{ en: '🧾 Keep the bill next to you', zh: '🧾 把账单放在旁边对着看', my: '🧾 ဘေလ်ကို ဘေးတွင် ထားပါ' }] },
          { shot: 'dbs.addbillreview', tap: 'addnow', en: 'Check the details. Tap Add now. Next time the bill is already saved.', zh: '核对资料，点 “Add now”（添加）。下次就不用再加了。', my: 'အသေးစိတ်ကို စစ်ပါ။ Add now ကို နှိပ်ပါ။ နောက်တစ်ကြိမ်တွင် ဘေလ်ကို သိမ်းထားပြီး ဖြစ်ပါမည်။' },
          { shot: 'dbs.billsaved', tap: 'bill', en: 'Tap the bill you want to pay.', zh: '点你要缴付的账单。', my: 'ပေးလိုသော ဘေလ်ကို နှိပ်ပါ။' },
          { shot: 'dbs.paybill', tap: 'amount', en: 'Type the amount from your bill. Choose Now. Tap Next.', zh: '输入账单上的金额，选 “Now”（现在），点 “Next”。', my: 'ဘေလ်ပေါ်ရှိ ပမာဏကို ရိုက်ထည့်ပါ။ Now ကို ရွေးပါ။ Next ကို နှိပ်ပါ။' },
          { shot: 'dbs.billreview', tap: 'send', en: 'Check once more. Tap Pay bills now.', zh: '再核对一次，点 “Pay bills now”（立即缴付）。', my: 'နောက်တစ်ကြိမ် စစ်ပါ။ Pay bills now ကို နှိပ်ပါ။' },
          { shot: 'dbs.billsent', en: 'Successful! The bill is paid.', zh: '成功了！账单已缴付。', my: 'အောင်မြင်ပါပြီ။ ဘေလ် ပေးပြီးပါပြီ။' },
        ],
      },
      {
        id: 'dbs-safe', emoji: '🛡️', en: 'Stay safe from scams', zh: '防范诈骗', my: 'လိမ်လည်မှုမှ ကာကွယ်ခြင်း',
        steps: [
          { screen: 'dbs.sms', tap: 'delete', en: 'An SMS says your account is locked and has a link? It\'s a scam. Don\'t tap the link. Delete it.', zh: '短信说你的户口被锁、还附上链接？这是诈骗！不要点链接，把它删掉。', my: 'သင့်အကောင့် ပိတ်ထားသည်ဟု ပြောပြီး လင့်ခ်ပါသော SMS လား။ လိမ်လည်မှု ဖြစ်ပါသည်။ လင့်ခ်ကို မနှိပ်ပါနှင့်။ ဖျက်ပစ်ပါ။', chips: [{ en: '🚫 Banks don\'t send links to log in', zh: '🚫 银行不会发登录链接', my: '🚫 ဘဏ်များသည် ဝင်ရောက်ရန် လင့်ခ် မပို့ပါ' }] },
          { shot: 'dbs.start', en: 'Only use the app itself. Even its first screen reminds you never to share your details or OTP.', zh: '只用银行应用程序本身。它的首页也提醒你：绝不透露资料或 OTP。', my: 'အက်ပ်ကိုသာ သုံးပါ။ ၎င်း၏ ပထမစာမျက်နှာကပင် သင့်အချက်အလက် သို့မဟုတ် OTP ကို ဘယ်တော့မှ မမျှဝေရန် သတိပေးပါသည်။' },
          { screen: 'dbs.call', tap: 'call', en: 'Gave your details to a scammer? Call the DBS Fraud Hotline right away: 1800 339 6963. It\'s open 24 hours.', zh: '把资料给了骗子？马上打 DBS 防诈骗热线：1800 339 6963，24 小时服务。', my: 'လိမ်လည်သူကို အချက်အလက် ပေးမိပြီလား။ DBS Fraud Hotline 1800 339 6963 ကို ချက်ချင်း ဖုန်းဆက်ပါ။ ၂၄ နာရီ ဖွင့်ပါသည်။', chips: ['📞 1800 339 6963', { en: '🌏 From overseas: +65 6339 6963', zh: '🌏 海外：+65 6339 6963', my: '🌏 နိုင်ငံခြားမှ: +65 6339 6963' }] },
          { screen: 'dbs.call', tap: 'ivr', en: 'Choose the option for Safety Switch. It blocks your digibank, PayLah! and cards, so no one can take money out.', zh: '选择 “Safety Switch”（安全开关），它会冻结你的 digibank、PayLah! 和银行卡，别人就拿不走钱。', my: 'Safety Switch ရွေးချယ်မှုကို ရွေးပါ။ ၎င်းသည် သင့် digibank၊ PayLah! နှင့် ကတ်များကို ပိတ်ပေးသဖြင့် မည်သူမျှ ငွေမထုတ်နိုင်ပါ။' },
          { screen: 'dbs.call', en: 'Stay on the line. An officer will help you with the next steps. For advice, you can also call the ScamShield Helpline 1799.', zh: '不要挂断，客服人员会协助你下一步。也可以打 ScamShield 热线 1799 寻求建议。', my: 'ဖုန်းကို မချပါနှင့်။ ဝန်ထမ်းတစ်ဦးက နောက်အဆင့်များကို ကူညီပါမည်။ အကြံဉာဏ်အတွက် ScamShield Helpline 1799 ကိုလည်း ဆက်နိုင်ပါသည်။', chips: ['📞 1799', { en: '🤫 Never share your OTP or PIN', zh: '🤫 绝不透露 OTP 或密码', my: '🤫 OTP သို့မဟုတ် PIN ကို ဘယ်တော့မှ မမျှဝေပါနှင့်' }] },
        ],
      },
    ],
  },
];

// The text in the chosen language (English if a translation is missing).
export const say = (obj, lang) => (typeof obj === 'string' ? obj : obj[lang] || obj.en);

export const findLesson = (id) => {
  for (const app of APPS) {
    const lesson = app.lessons.find((l) => l.id === id);
    if (lesson) return { app, lesson };
  }
  return null;
};

// A screenshot with its buttons laid over it, and a watermark so it can't pass for the real app.
const WATERMARK = 'PRACTICE · 练习 · လေ့ကျင့်ရန်';
const photo = (key) => {
  const { h, spots, warn } = SHOTS[key];
  return `<div class="gd-shot" style="aspect-ratio: 600 / ${h}">
    <img src="shots/${key.replace('.', '-')}.jpg" alt="" width="600" height="${h}" decoding="async">
    ${Object.entries(spots).map(([id, [x, y, w, hh]]) => `<div class="gd-spot" data-id="${id}" style="left:${x}%;top:${y}%;width:${w}%;height:${hh}%"></div>`).join('')}
    <div class="gd-wm">${`<span>${WATERMARK}</span>`.repeat(8)}</div>
    ${warn ? '<div class="gd-wmwarn">PRACTICE PICTURE · NOT THE REAL APP<br>Never type your PIN on a website</div>' : ''}
  </div>`;
};

export const renderScreen = (step) => (step.shot ? photo(step.shot) : SCREENS[step.screen](step.opts || {}));
