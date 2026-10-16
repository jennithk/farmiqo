import { addCartItem, assignBulkGroup, cancelBulkGroup, confirmPasswordReset, connectRealtime, createAddress, createBulkGroup, createListing, createOrder, deleteAccount as deleteAccountRequest, deleteAddress, deleteListing as deleteListingRequest, fulfilBulkGroup, getAddresses, getBulkGroup, getBulkGroups, getFarmerBulkGroups, getCart, getCurrentUser, getFarmerListings, getFarmerOrders, getFeeConfig, getForecast, getListings, getOrders, getSavedUser, getUploadConfig, getUploadSignature, isAuthenticated, joinBulkGroup, leaveBulkGroup, login, logout as clearSession, register, removeCartItem, requestPasswordReset, unassignBulkGroup, updateAddress, updateCartItem, updateListing, updateOrderStatus, updateProfile } from './services/api.js';
import en from './i18n/en.js';
import te from './i18n/te.js';
import { categoryIcon, icon, produceIcon } from './services/icons.js';
import 'leaflet/dist/leaflet.css';

const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
let leafletModule = null;
async function loadLeaflet() {
  if (!leafletModule) leafletModule = await import('leaflet');
  return leafletModule.default || leafletModule;
}
function pinIcon(L) {
  return L.divIcon({ className: 'map-pin-wrap', html: '<div class="map-pin"></div>', iconSize: [26, 26], iconAnchor: [13, 13] });
}
let activeMap = null;
let activeMarker = null;
function destroyMap() {
  try { activeMarker?.remove(); } catch {}
  try { activeMap?.remove(); } catch {}
  activeMap = null;
  activeMarker = null;
}
async function searchPlaces(query) {
  const url = `${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}
async function reversePlace(lat, lng) {
  const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Lookup failed');
  return res.json();
}
function defaultCenter() {
  return { lat: 16.5062, lng: 80.648, zoom: 12, note: 'Showing Vijayawada — search or move the pin to your location.' };
}

const ASSET='/assets/';
const IMG={
  logo:'01_-_Splash_+_Role_Select_0.jpeg',
  hero:'01_-_Splash_+_Role_Select_1.jpeg',
  tomato:'10_-_Product_Detail_1.jpeg',
  tomato2:'12_-_Cart_1.jpeg',
  banana:'12_-_Cart_2.jpeg',
  spinach:'12_-_Cart_3.jpeg',
  onion:'09_-_Consumer_Home_6.jpeg'
};
// Curated product assets whose contents were matched to these products.
// Strict keyword hits only — anything else falls through to the neutral tile
// so no product ever displays another product's photo.
const PRODUCT_PHOTOS=[['tomato',IMG.tomato],['banana',IMG.banana],['plantain',IMG.banana],['spinach',IMG.spinach],['palak',IMG.spinach],['onion',IMG.onion]];
function withCloudinary(url){try{const u=new URL(url);if(u.hostname==='res.cloudinary.com'&&u.pathname.includes('/upload/')&&!u.pathname.includes('/f_auto'))return url.replace('/upload/','/upload/f_auto,q_auto,w_800/')}catch{}return url}
function resolveProductImage(name,cat,raw){
  const source=String(raw||'').trim();
  if(source){
    if(/^https:\/\//i.test(source))return withCloudinary(source);
    return source.replace(/^\/assets\//,'').replace(/^\//,'')||'icon.svg';
  }
  const n=String(name||'').toLowerCase();
  for(const [keyword,file] of PRODUCT_PHOTOS)if(n.includes(keyword))return file;
  return 'icon.svg';
}
let products=[];
const savedUser=getSavedUser();
const cachedRole=['FARMER','CONSUMER'].includes(savedUser?.role)?savedUser.role.toLowerCase():null;
const dictionaries={en,te};
const state={
 role: isAuthenticated()?cachedRole:null,
 user: isAuthenticated()&&cachedRole?savedUser:null,
 authRole:null,
 authMode:'register',
 screen: isAuthenticated()&&cachedRole?(cachedRole==='farmer'?'farmerHome':'consumerHome'):'role',
  cart: {},
  orders: [],
  joined: [],
  listings: [],
  bulkGroups: [],
  bulkOffers: [],
  forecast: null,
  resetToken: null,
  offerForm: { listingId: '', target: '', min: '', max: '', note: '', slot: '' },

  groupForm: { product: '', target: '', min: '', max: '', info: '', pincode: '' },
  bulkJoinAddr: {},
  groupFilter: 'All',
  communityRequests: [],
  creatingGroup: false,
  uploadUrl: '',
 selectedProduct:null,
 selectedOrderId:'',
 profileEditing:false,
 savingProfile:false,
 payMethod:'UPI',
 addresses:[],
 selectedAddressId:'',
 feePercent:5,
 mapCtx:null,
 mapDraft:null,
 addrForm:{label:'Home',house:'',street:'',area:'',landmark:'',pincode:'',phone:'',editingId:''},
 language:localStorage.getItem('farmiqo-language')==='te'?'te':'en',
 cat:'All',
 search:'',
};
function persist(){localStorage.setItem('farmiqo-joined',JSON.stringify(state.joined));}
function money(n){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n)||0)}
function cartItems(){return Object.entries(state.cart).map(([id,qty])=>({p:products.find(x=>x.id===id),qty})).filter(x=>x.p&&x.qty>0)}
function cartCount(){return cartItems().reduce((s,x)=>s+x.qty,0)}
function toast(msg){const el=document.getElementById('toast');el.textContent=localizeText(msg);el.classList.add('show');clearTimeout(window.__t);window.__t=setTimeout(()=>el.classList.remove('show'),2200)}
function setScreen(s){state.screen=s;state.selectedProduct=null;if(s==='consumerHome'||s==='search'||s==='cart')refreshMarketplace();if(s==='consumerHome'&&state.role==='consumer')refreshBulkGroups();if(s==='listings'||s==='farmerHome'||s==='bulkOrders')refreshFarmerData();if(s==='bulkOrders'&&state.role==='farmer')refreshFarmerOffers();if(s==='bulkGroups'&&state.role==='consumer')refreshBulkGroups();if(s==='forecast'&&state.role==='farmer')refreshForecast();if(s==='orders')refreshOrders();if(s==='payment'&&state.role==='consumer')refreshAddresses();if(s==='profile')refreshAddresses();render()}
function addressText(a){if(!a)return '';return [a.formattedAddress||[a.house,a.street,a.area,a.landmark].filter(Boolean).join(', '),a.pincode].filter(Boolean).join(' · ')}
async function refreshFeeConfig(){try{const config=await getFeeConfig();if(Number.isFinite(Number(config?.deliveryFeePercent)))state.feePercent=Number(config.deliveryFeePercent)}catch{}}
async function refreshAddresses(){if(state.role!=='consumer')return;try{state.addresses=await getAddresses();if(!state.addresses.some((a)=>a.id===state.selectedAddressId)){const saved=localStorage.getItem('farmiqo-last-address');state.selectedAddressId=state.addresses.some((a)=>a.id===saved)?saved:(state.addresses[0]?.id||'')}if(['payment','profile'].includes(state.screen))render()}catch(error){if(error.status!==401)toast(error.message)}}
function communityBanner(){const open=state.bulkGroups.filter((g)=>g.status==='OPEN');if(!open.length)return '';const top=open.map((g)=>({g,pct:g.targetQuantity?g.collectedQuantity/g.targetQuantity*100:0})).sort((a,b)=>b.pct-a.pct)[0];const pct=Math.min(100,Math.round(top.pct));return `<div class="forecast-banner"><div class="row"><div><div class="title">Save more with your community</div><div class="desc">${escapeHtml(top.g.productName)} group is ${pct}% full</div></div><button class="btn yellow" style="padding:10px 16px" onclick="setScreen('bulkGroups')">Join</button></div></div>`}
async function refreshBulkGroups(){if(state.role!=='consumer')return;try{const [groups,addresses]=await Promise.all([getBulkGroups({status:'ALL'}),getAddresses()]);state.bulkGroups=groups;state.addresses=addresses;if(!state.addresses.some((a)=>a.id===state.selectedAddressId)){const saved=localStorage.getItem('farmiqo-last-address');state.selectedAddressId=state.addresses.some((a)=>a.id===saved)?saved:(state.addresses[0]?.id||'')}if(state.screen==='bulkGroups')render()}catch(error){if(error.status!==401)toast(error.message)}}
function bulkJoinAddressId(groupId){return state.bulkJoinAddr?.[groupId]||state.selectedAddressId||''}
async function refreshFarmerOffers(){if(state.role!=='farmer')return;try{const [mine,requests]=await Promise.all([getFarmerBulkGroups(),getBulkGroups({model:'community',status:'OPEN'})]);const seen=new Set();state.bulkOffers=mine.filter((g)=>(seen.has(g.groupId)?false:(seen.add(g.groupId),true)));state.communityRequests=requests.filter((g)=>!g.assignedFarmerId&&String(g.farmerId?.id||g.farmer?.id||'')!==state.user?.id);if(state.screen==='bulkOrders')render()}catch(error){if(error.status!==401)toast(error.message)}}
function communityFormError(msg){const t=document.getElementById('cg-error');if(t)t.textContent=msg;else toast(msg)}
async function createCommunityUI(){if(state.creatingGroup)return;const f=state.groupForm;const product=f.product.trim();const target=Number(f.target);const min=f.min===''?undefined:Number(f.min);const max=f.max===''?undefined:Number(f.max);if(!product){communityFormError('Enter a produce name.');return}if(!Number.isFinite(target)||target<=0){communityFormError('Enter a target quantity above zero.');return}if(min!==undefined&&(!Number.isFinite(min)||min<=0)){communityFormError('Enter a minimum per person above zero.');return}if(max!==undefined&&(!Number.isFinite(max)||(min!==undefined&&max<min))){communityFormError('Maximum per person must not be below the minimum.');return}if(f.pincode&&!/^\d{6}$/.test(f.pincode)){communityFormError('Pincode must be 6 digits.');return}state.creatingGroup=true;render();try{await createBulkGroup({productName:product,targetQuantity:target,minPerParticipant:min,maxPerParticipant:max,deliveryInfo:f.info,pincode:f.pincode||undefined});state.groupForm={product:'',target:'',min:'',max:'',info:'',pincode:''};toast('Community group created');await refreshBulkGroups()}catch(error){communityFormError(error.message)}finally{state.creatingGroup=false;render()}}
async function assignBulkGroupUI(groupId){try{await assignBulkGroup(groupId);toast('Group assigned to you');await refreshFarmerOffers()}catch(error){toast(error.message)}}
async function unassignBulkGroupUI(groupId){try{await unassignBulkGroup(groupId);toast('Assignment released');await refreshFarmerOffers()}catch(error){toast(error.message)}}
async function refreshForecast(){if(state.role!=='farmer')return;try{state.forecast=await getForecast();if(state.screen==='forecast')render()}catch(error){if(error.status!==401)toast(error.message)}}
function setRole(r){state.authRole=r;state.authMode='register';state.screen='auth';render();}
function authScreen(){const registering=state.authMode==='register';return `<div class="screen role-screen"><div class="hero-logo"><img class="brand-symbol" src="/icon.svg" alt=""><div class="brand-copy"><div class="word">Farmiqo</div><div class="tag">Farmer to Consumer</div></div></div><div class="card auth-card"><h1>${registering?'Create your account':'Sign in'}</h1><p>${state.authRole==='farmer'?'Farmer account':'Consumer account'}</p><form onsubmit="submitAuth(event)">${registering?`<label class="auth-field">Full name<input id="auth-name" class="input" autocomplete="name" required></label><label class="auth-field">Phone<input id="auth-phone" class="input" type="tel" autocomplete="tel"></label>`:''}<label class="auth-field">Email<input id="auth-email" class="input" type="email" autocomplete="email" required></label><label class="auth-field">Password<input id="auth-password" class="input" type="password" minlength="8" autocomplete="${registering?'new-password':'current-password'}" required></label>${registering&&state.authRole==='farmer'?`<label class="auth-field">Farm name<input id="auth-farm" class="input"></label>`:''}${registering?`<label class="auth-field">Pincode<input id="auth-pincode" class="input" inputmode="numeric" maxlength="6"></label>`:''}<div id="auth-error" class="auth-error" role="alert"></div><button class="btn primary block" type="submit">${registering?'Create account':'Sign in'}</button></form><button class="auth-toggle" type="button" onclick="toggleAuthMode()">${registering?'Already have an account? Sign in':'New to Farmiqo? Create account'}</button>${registering?'':`<button class="auth-toggle" type="button" onclick="state.screen='forgot';render()">Forgot password?</button>`}<button class="auth-back" type="button" onclick="state.screen='role';render()">Back to role selection</button></div></div>`}
function normalizeListing(row){const date=new Date(row.harvestedAt);const age=Math.max(0,Math.floor((Date.now()-date.getTime())/86400000));return {...row,id:row.id||row.listingId,farmer:row.farmerName||row.farmer?.name||'',distance:row.location||row.farmer?.location||'',qty:Number(row.quantity??row.qty)||0,cat:row.category||'Veg',img:row.img?.replace(/^\/assets\//,'')||IMG.tomato,harvest:age===0?'Harvested today':age===1?'Harvested yesterday':`${age} days old`}}
async function refreshMarketplace(){try{products=(await getListings({category:state.cat,q:state.search})).map(normalizeListing);if(state.role==='consumer'){const cart=await getCart();state.cart=Object.fromEntries(cart.map(entry=>[entry.listing.id,entry.quantity]))}render()}catch(error){if(error.status===401){clearSession();state.role=null;state.user=null;state.screen='role';render()}else toast(error.message)}}
async function refreshFarmerData(){if(state.role!=='farmer')return;try{const [listings,orders]=await Promise.all([getFarmerListings(),getFarmerOrders()]);state.listings=listings.map(normalizeListing);state.orders=orders.map(({order,subOrder})=>({id:order.orderId,status:subOrder.status,items:subOrder.itemIndexes.map(index=>{const item=order.items[index];return `${item.productName} ${item.quantity}kg`}).join(' · '),amount:subOrder.itemIndexes.reduce((sum,index)=>sum+order.items[index].subtotal,0),consumer:order.consumerName,paymentMethod:order.paymentMethod,subOrderId:subOrder.subOrderId,rawStatus:subOrder.status}));if(state.screen==='farmerHome'||state.screen==='listings'||state.screen==='bulkOrders')render()}catch(error){if(error.status===401){clearSession();state.role=null;state.user=null;state.screen='role';render()}else toast(error.message)}}
async function refreshOrders(){if(state.role!=='consumer')return;try{state.orders=(await getOrders()).map(order=>({id:order.orderId,status:({ORDER_PLACED:'Open',FARMER_ACCEPTED:'Accepted',FARMER_REJECTED:'Rejected',PREPARING:'Preparing',READY_FOR_PICKUP:'Ready for pickup',OUT_FOR_DELIVERY:'Out for delivery',DELIVERED:'Delivered',COMPLETED:'Completed',CANCELLED:'Cancelled'})[order.status]||order.status,rawStatus:order.status,items:order.items.map(item=>`${item.productName} ${item.quantity}kg · ${item.farmerName}`).join(' · '),amount:order.total,group:'',paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,raw:order}));if(state.screen==='orders')render()}catch(error){toast(error.message)}}
async function submitAuth(event){event.preventDefault();const values={email:document.getElementById('auth-email').value.trim(),password:document.getElementById('auth-password').value};try{const result=state.authMode==='register'?await register({...values,name:document.getElementById('auth-name').value.trim(),phone:document.getElementById('auth-phone')?.value.trim()||'',role:state.authRole==='farmer'?'FARMER':'CONSUMER',farmName:document.getElementById('auth-farm')?.value.trim()||'',pincode:document.getElementById('auth-pincode')?.value.trim()||''}):await login(values);if(result.user.role.toLowerCase()!==state.authRole){clearSession();throw new Error('This account belongs to a different role. Choose the matching role to continue.')}state.user=result.user;state.role=result.user.role.toLowerCase();state.screen=state.role==='farmer'?'farmerHome':'consumerHome';connectRealtime(handleRealtimeEvent);await refreshFeeConfig();await (state.role==='farmer'?refreshFarmerData():refreshMarketplace());await refreshAddresses();render()}catch(error){const target=document.getElementById('auth-error');if(target)target.textContent=error.message}}
function toggleAuthMode(){state.authMode=state.authMode==='register'?'login':'register';render()}
async function handleRealtimeEvent(event){if(event.startsWith('listing:')&&state.role==='consumer'){await refreshMarketplace();return}if(event==='bulk:updated'){if(state.role==='consumer')await refreshBulkGroups();else await refreshFarmerOffers();return}if(event.startsWith('order:')||event==='notification:new'){if(state.role==='farmer')await refreshFarmerData();else await refreshOrders();toast(event==='order:created'?'New order received':'Order status updated')}}
function header(title,sub,back=false){return `<div class="header">${back?`<button class="icon-btn" onclick="goBack()">‹</button>`:''}<div class="brand"><img class="brand-mark" src="/icon.svg" alt=""><div class="brand-text">Farmiqo<small>Farmer to Consumer</small></div></div><div class="header-copy"><div class="header-title">${title}</div><div class="header-sub">${sub||''}</div></div><button class="icon-btn" onclick="openProfile()">${back?'♡':'⌁'}</button></div>`}
function goBack(){ if(['product','cart','payment'].includes(state.screen)){state.screen='consumerHome'} else if(state.screen==='profile') state.screen=state.role==='farmer'?'farmerHome':'consumerHome'; else if(state.screen==='addressPicker'){state.screen=state.mapCtx?.mode==='farm'?'profile':(state.mapCtx?.mode==='bulkJoin'?'bulkGroups':(state.role==='farmer'?'farmerHome':'profile'))} else if(state.screen==='addressForm'){state.screen='addressPicker'} else state.screen=state.role==='farmer'?'farmerHome':'consumerHome'; render() }
function openProfile(){state.profileEditing=false;state.savingProfile=false;state.screen='profile';refreshAddresses();render()}
function farmerNav(){return nav([{s:'farmerHome',i:'⌂',t:'Home'},{s:'listings',i:'☷',t:'My Listings'},{s:'bulkOrders',i:'◈',t:'Bulk Orders'},{s:'forecast',i:'▥',t:'Forecast'},{s:'profile',i:'♙',t:'Profile'}])}
function consumerNav(){return nav([{s:'consumerHome',i:'⌂',t:'Home'},{s:'search',i:'⌕',t:'Search'},{s:'bulkGroups',i:'♧',t:'Bulk Groups'},{s:'cart',i:'🛒',t:'Cart'},{s:'orders',i:'◈',t:'Orders'},{s:'profile',i:'♙',t:'Profile'}])}
function nav(items){return `<div class="bottom-nav">${items.map(x=>`<button class="nav-item ${state.screen===x.s?'active':''}" onclick="setScreen('${x.s}')"><span class="ico">${x.i}</span><span>${x.t}</span></button>`).join('')}</div>`}
function roleScreen(){return `<div class="screen role-screen"><div class="hero-logo"><img class="brand-symbol" src="/icon.svg" alt=""><div class="brand-copy"><div class="word">Farmiqo</div><div class="tag">Farmer to Consumer</div></div></div><div class="hero-telugu">పొలం నుంచి మీ ఇంటికి</div><div class="hero-image"><img src="${ASSET+IMG.hero}" alt="A local farmer with a fresh harvest"/></div><h1 class="role-heading">How would you like to use Farmiqo?</h1><button type="button" class="role-card farmer" aria-label="Continue as a farmer" onclick="setRole('farmer')"><span class="role-icon" aria-hidden="true">🚜</span><span class="role-main"><span class="role-title">I’m a Farmer</span><span class="role-te">నేను రైతును</span><span class="role-desc">List harvests & fulfil local demand</span></span><span class="chev" aria-hidden="true">›</span></button><button type="button" class="role-card consumer" aria-label="Continue as a consumer" onclick="setRole('consumer')"><span class="role-icon" aria-hidden="true">🧺</span><span class="role-main"><span class="role-title">I’m a Consumer</span><span class="role-te">నేను వినియోగదారుడిని</span><span class="role-desc">Buy fresh from nearby farms</span></span><span class="chev" aria-hidden="true">›</span></button><div class="role-foot">One trusted marketplace · Switch roles anytime</div></div>`}
function farmerHome(){return `<div class="screen">${header('Good morning, Lakshmi','520008 · Poranki')}<div class="container"><div class="section-title">Your farm at a glance</div><div class="muted" style="font-size:13px;margin:4px 0 14px">Wednesday, 30 September</div><div class="grid2"><div class="card stat"><div class="row"><span class="kicker">Active listings</span><span class="badge">🌱</span></div><div class="value">${state.listings.length}</div><div class="sub">2 low in stock</div></div><div class="card stat"><div class="row"><span class="kicker">Open bulk orders</span><span class="badge">♧</span></div><div class="value">3</div><div class="sub">48 kg requested</div></div></div><div class="rev" style="margin-top:14px"><div>Revenue this week</div><div class="value">₹8,460</div><div class="sub">↑ 12% from last week</div><div class="rupee">₹</div></div><button class="btn primary block add-produce" onclick="openAddProduce()">＋ Add Produce<br><small style="opacity:.75">పంటను జోడించండి</small></button><div class="forecast-banner"><div class="row"><div class="title">✣ Demand forecast</div><button class="sm-btn edit" onclick="setScreen('forecast')">View</button></div><div class="desc">Bring ~52kg tomatoes to 520008 this week</div></div><div class="card order-mini" style="margin-top:14px"><div class="date-box"><div>01</div><small>OCT</small></div><div style="flex:1"><div class="order-name">BHEL Community pickup</div><div class="order-meta">Tomato · 20 kg · 7–9 AM</div></div><span class="badge blue">Accepted</span></div></div>${farmerNav()}</div>`}
function listings(){const q=state.search.toLowerCase();const rows=state.listings.filter(x=>!q||x.name.toLowerCase().includes(q));return `<div class="screen">${header('My listings',`${state.listings.length} active · 2 sold out`)}<div class="container"><div class="row" style="margin-bottom:12px"><div class="search" style="flex:1"><span class="ico">⌕</span><input class="input" placeholder="Search listings" value="${escapeHtml(state.search)}" oninput="state.search=this.value;render()"></div><button class="btn primary" style="width:48px;padding:0" onclick="openAddProduce()">＋</button></div><div class="stack">${rows.map(x=>`<div class="card listing"><img src="${ASSET+x.img}"><div class="listing-main"><div class="row"><div style="font-weight:900;font-size:17px">${x.name}</div><span class="badge ${x.status==='Sold Out'?'red':''}">${x.status}</span></div><div class="qty">${x.qty} kg left</div><div class="price">${money(x.price)}/kg</div><div class="actions"><button class="sm-btn edit" onclick="editListing('${x.id}')">Edit</button><button class="sm-btn delete" onclick="deleteListing('${x.id}')">Delete</button></div></div></div>`).join('')}</div><div class="forecast-banner" style="margin-top:14px">⌁ Forecast suggests raising Tomato quantity to 52kg for this week.</div></div>${farmerNav()}</div>`}
function bulkOrders(){const arr=[['BHEL Community','Tomato','20 kg','Oct 1 · AM','640','Open'],['Poranki Greens','Leafy greens','12 kg','Oct 2 · AM','640','Accepted'],['Benz Circle','Banana','16 kg','Oct 3 · PM','640','Open']];return `<div class="screen">${header('Bulk orders','Assigned to you · 520008')}<div class="container"><div class="rev"><div>Open demand near you</div><div class="value">48 kg · 3 groups</div><div class="sub">Tap an order to manage it</div><div class="rupee">▣</div></div><div class="row" style="margin:16px 0 8px"><div class="section-title" style="font-size:19px">Assigned orders</div><button class="sm-btn edit">View history</button></div><div class="stack">${arr.map((x,i)=>`<div class="card group-card"><div class="group-row"><div><div class="group-title">${x[0]}</div><div class="group-sub">${x[1]}</div></div><span class="badge ${x[5]==='Accepted'?'blue':''}">${x[5]}</span></div><div class="grid2" style="margin-top:14px;font-size:12px"><div><div class="muted">TOTAL QTY</div><b style="display:block;margin-top:4px;font-size:15px">${x[2]}</b></div><div><div class="muted">SLOT DATE</div><b style="display:block;margin-top:4px;font-size:15px">${x[3]}</b></div></div><div class="row" style="margin-top:14px"><div><div class="muted" style="font-size:12px">PAYOUT</div><b style="color:var(--green)">${money(x[4])}</b></div>${x[5]==='Open'?`<div style="display:flex;gap:8px"><button class="btn danger" onclick="toast('Order rejected')">Reject</button><button class="btn primary" onclick="toast('Bulk order accepted');this.closest('.card').querySelector('.badge').textContent='Accepted'">✓ Accept<br><small>అంగీకరించండి</small></button></div>`:''}</div></div>`).join('')}</div></div>${farmerNav()}</div>`}
function forecast(){const vals=[38,44,49,52,47,42,35];return `<div class="screen">${header('Demand forecast','Pincode 520008')}<div class="container"><div class="row"><div class="input" style="font-weight:800">Tomato⌄</div><div class="input" style="width:45%;font-weight:800">◉ 520008</div></div><div class="forecast-banner" style="margin:14px 0">✣ <b>Bring ~52kg tomatoes to 520008 this week</b></div><div class="card" style="padding:16px"><div class="row"><div><b>7-day predicted quantity</b><div class="muted" style="font-size:12px;margin-top:3px">Kilograms · Sep 30–Oct 6</div></div><span class="badge">82% confidence</span></div><div style="height:200px;display:flex;align-items:flex-end;gap:8px;margin-top:18px;padding-bottom:25px">${vals.map((v,i)=>`<div style="flex:1;text-align:center"><div style="font-size:11px;margin-bottom:5px;font-weight:850">${v}</div><div style="height:${v*2.15}px;max-height:138px;border-radius:8px 8px 3px 3px;background:${v===52?'var(--yellow)':'var(--green)'}"></div><div class="muted" style="font-size:10px;margin-top:5px">${['W','T','F','S','S','M','T'][i]}</div></div>`).join('')}</div></div><div class="card" style="overflow:hidden;margin-top:14px"><div style="display:grid;grid-template-columns:1fr 1fr;padding:11px 14px;background:var(--green-soft);font-size:11px;font-weight:900;color:#4f7f55"><span>DATE</span><span style="text-align:right">PREDICTED QTY</span></div>${[['Oct 1, Thu','44 kg'],['Oct 2, Fri','49 kg'],['Oct 3, Sat','52 kg']].map(r=>`<div class="row" style="padding:12px 14px;border-top:1px solid var(--line);font-size:13px"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div><button class="btn primary block" style="margin-top:16px" onclick="adjustTomato()">☷ Adjust tomato listing to 52 kg<br><small>పరిమాణాన్ని మార్చండి</small></button></div>${farmerNav()}</div>`}
function consumerHome(){const cats=['All','Veg','Fruits','Leafy'];return `<div class="screen">${header('Fresh near you','Deliver to 520008')}<div class="container"><div class="search"><span class="ico">⌕</span><input class="input" placeholder="Search fresh produce" value="${escapeHtml(state.search)}" oninput="state.search=this.value;render()"></div><div class="chips" style="margin:12px 0 16px">${cats.map(c=>`<button class="chip ${state.cat===c?'active':''}" onclick="state.cat='${c}';render()">${c==='All'?'▦':c==='Veg'?'◍':c==='Fruits'?'◌':'◐'} ${c}</button>`).join('')}</div>${communityBanner()}<div class="row" style="margin:18px 0 12px"><div class="section-title" style="font-size:20px">Today’s harvest</div><button class="sm-btn edit" onclick="setScreen('search')">See all</button></div><div class="product-grid">${products.filter(p=>(state.cat==='All'||p.cat===state.cat)&&(!state.search||p.name.toLowerCase().includes(state.search.toLowerCase()))).map(p=>productCard(p)).join('')}</div></div>${consumerNav()}</div>`}
function productCard(p){return `<div class="card product-card"><img src="${ASSET+p.img}" onclick="openProduct('${p.id}')" style="cursor:pointer"><div class="product-body"><div class="product-title" onclick="openProduct('${p.id}')" style="cursor:pointer">${p.name}</div><div class="producer">${p.farmer} · ${p.distance}</div><div style="margin:0 0 8px">${sourceBadge(p)}</div><div class="product-bottom"><span class="price" style="margin:0">${money(p.price)}/kg</span><button class="add" onclick="addToCart('${p.id}',1)">+ Add</button></div></div></div>`}
function searchScreen(){return `<div class="screen">${header('Search','Fresh produce near 520008')}<div class="container"><div class="search"><span class="ico">⌕</span><input class="input" placeholder="Search fresh produce" value="${escapeHtml(state.search)}" oninput="state.search=this.value;render()"></div><div class="chips" style="margin:12px 0">${['All','Veg','Fruits','Leafy'].map(c=>`<button class="chip ${state.cat===c?'active':''}" onclick="state.cat='${c}';render()">${c}</button>`).join('')}</div><div class="product-grid">${products.filter(p=>(state.cat==='All'||p.cat===state.cat)&&(!state.search||p.name.toLowerCase().includes(state.search.toLowerCase()))).map(productCard).join('')||'<div class="empty" style="grid-column:1/-1">No produce found.</div>'}</div></div>${consumerNav()}</div>`}
function productDetail(p){return `<div class="screen">${header(p.name,p.harvest,true)}<div><img src="${ASSET+p.img}" style="width:100%;height:315px;object-fit:cover"></div><div class="container"><div class="row"><div><h1 style="margin:4px 0 6px;font-size:26px">Farm-fresh ${p.name}</h1><div class="muted">Local hybrid · Grade A</div></div><div style="text-align:right"><div class="price" style="font-size:24px">${money(p.price)}</div><div class="muted" style="font-size:12px">per kg</div></div></div><div class="card" style="padding:14px;margin-top:16px"><div class="row"><div><b>${p.farmer}</b><div class="muted" style="font-size:12px">Poranki · ${p.distance} away</div></div><span style="font-weight:900">☆ 4.8</span></div></div><div style="margin-top:16px"><div class="row"><div><b>Select quantity</b><div class="muted" style="font-size:12px">${p.qty} kg available</div></div><div class="qty-control"><button onclick="changeQty('${p.id}',-1)">−</button><span>${state.cart[p.id]||2} kg</span><button onclick="changeQty('${p.id}',1)">+</button></div></div></div><div class="grid2" style="margin-top:15px;grid-template-columns:repeat(3,1fr)"><div class="card" style="padding:12px;text-align:center;background:var(--green-soft)">▣<div style="font-size:12px;color:var(--green);margin-top:5px">Today</div></div><div class="card" style="padding:12px;text-align:center;background:var(--green-soft)">⌁<div style="font-size:12px;color:var(--green);margin-top:5px">No chemicals</div></div><div class="card" style="padding:12px;text-align:center;background:var(--green-soft)">🚚<div style="font-size:12px;color:var(--green);margin-top:5px">Tomorrow</div></div></div><button class="btn primary block" style="margin-top:16px" onclick="addToCart('${p.id}',${state.cart[p.id]||2},true)">🛒 Add to Cart · ${money(p.price*(state.cart[p.id]||2))}<br><small>కార్ట్‌కు జోడించండి</small></button><button class="btn yellow block" style="margin-top:10px" onclick="joinGroup('BHEL Community')">♧ Join Bulk Group · Save ₹8/kg<br><small>బల్క్ గ్రూప్‌లో చేరండి</small></button></div></div>`}
function bulkGroups(){const groups=[['BHEL Community','Tomato','12/20kg pooled','6hrs left',60,'join'],['Poranki Greens','Leafy greens','18/18kg pooled','Target reached',90,'joined'],['Benz Circle','Banana','8/25kg pooled','1 day left',32,'join'],['Kanuru Homes','Onion','21/30kg pooled','2 days left',70,'join']];return `<div class="screen">${header('Bulk groups','Communities near 520008')}<div class="container"><div class="forecast-banner"><div style="font-weight:900;color:#7b651f">◉ Pool demand. Pay less.</div><div class="desc">Orders aggregate when the target quantity is reached.</div></div><div class="chips" style="margin:10px 0 18px"><button class="chip active">All</button><button class="chip">◷ Closing soon</button><button class="chip">✓ Joined</button></div><div class="row" style="margin-bottom:10px"><div class="section-title" style="font-size:19px">Available groups</div><button class="sm-btn edit">How it works</button></div><div class="stack">${groups.map(g=>`<div class="card group-card"><div class="group-row"><div><div class="group-title">${g[0]}</div><div class="group-sub">${g[1]} · Oct ${g[0]==='BHEL Community'?'1':g[0]==='Poranki Greens'?'2':g[0]==='Benz Circle'?'3':'4'}</div></div>${g[5]==='joined'||state.joined.includes(g[0])?'<span class="badge blue">Aggregated</span>':`<button class="btn primary" style="padding:9px 14px" onclick="joinGroup('${g[0]}')">Join</button>`}</div><div style="font-size:13px;font-weight:900;margin-top:14px">${g[2]}</div><div class="progress"><span style="width:${g[4]}%"></span></div><div class="group-foot"><span>${g[5]==='joined'?'Target reached':''}</span><span>${g[3]}</span></div></div>`).join('')}</div></div>${consumerNav()}</div>`}
function cart(){
  const items=cartItems();
  const totalQty=items.reduce((s,x)=>s+x.qty,0);
  const subtotal=Math.round(items.reduce((s,x)=>s+x.p.price*x.qty,0)*100)/100;
  const cartFee=Math.round(subtotal*state.feePercent)/100;
  const total=Math.max(0,Math.round((subtotal+cartFee)*100)/100);
  const itemHtml=items.map(x=>`<div class="card cart-item"><img src="${ASSET+x.p.img}"><div><div style="font-weight:900">${x.p.name}</div><div class="muted" style="font-size:12px">${x.p.farmer}</div><div class="qty-control" style="margin-top:8px"><button onclick="changeQty('${x.p.id}',-1)">−</button><span>${x.qty} kg</span><button onclick="changeQty('${x.p.id}',1)">+</button></div></div><div style="text-align:right"><button class="trash" onclick="removeFromCart('${x.p.id}')">⌫</button><div style="font-weight:900;color:var(--green);margin-top:22px">${money(x.p.price*x.qty)}</div></div></div>`).join('');
  const content=items.length?`<div class="stack">${itemHtml}</div><div class="card summary" style="margin-top:14px"><div class="summary-line"><span>Items subtotal</span><b>${money(subtotal)}</b></div><div class="summary-line"><span>Delivery fee (${state.feePercent}%)</span><b>${money(cartFee)}</b></div><div class="summary-line total"><span>Total</span><b style="color:var(--green)">${money(total)}</b></div></div><button class="btn primary block" style="margin-top:14px" onclick="state.screen='payment';render()">→ Place Order · ${money(total)}<br><small>ఆర్డర్ చేయండి</small></button>`:`<div class="empty"><div style="font-size:48px">🧺</div><h3>Your cart is empty</h3><p>Add fresh produce from nearby farms.</p><button class="btn primary" onclick="setScreen('consumerHome')">Browse produce</button></div>`;
  return `<div class="screen">${header('Your cart',totalQty+' items · '+totalQty+' kg',true)}<div class="container">${content}</div>${consumerNav()}</div>`;
}
function orders(){const os=state.orders.length?state.orders:[{id:'FQ-2841',status:'Accepted',items:'Tomato 2kg · Spinach 1kg · Banana 2kg',amount:168,group:'BHEL Community'},{id:'FQ-2829',status:'Aggregated',items:'Leafy greens 3kg · Onion 2kg',amount:132,group:'Poranki Greens'},{id:'FQ-2786',status:'Delivered',items:'Potato 3kg · Tomato 2kg',amount:204,group:''}];return `<div class="screen">${header('Orders','Track every farm order')}<div class="container"><div class="chips" style="background:#e7f2e8;padding:2px;border-radius:999px"><button class="chip active" style="flex:1">Active · 2</button><button class="chip" style="flex:1;background:transparent">Past orders</button></div><div class="stack" style="margin-top:14px">${os.map(o=>`<div class="card" style="padding:16px"><div class="row"><div><b>#${o.id}</b><div class="muted" style="font-size:12px">Placed Sep 30 · ${o.group||'Farmiqo'}</div></div><span class="badge ${o.status==='Delivered'?'':'blue'}">${o.status}</span></div><div class="muted" style="font-size:13px;margin-top:14px">${o.items}</div><div class="timeline">${['Open','Aggregated','Accepted','Delivered'].map((s,i)=>{const idx=['Open','Aggregated','Accepted','Delivered'].indexOf(o.status);return `<div class="timeline-step ${i<=idx?'done':''}"><div class="dot"></div><div class="timeline-label">${s}</div></div>`}).join('')}</div><div class="row" style="margin-top:14px"><b style="color:var(--green)">${money(o.amount)}</b><div style="display:flex;gap:8px"><button class="btn secondary" onclick="openOrderDetail('${o.id}')">View Details</button><button class="btn secondary" onclick="reorder('${o.id}')">↻ Reorder</button></div></div></div>`).join('')}</div></div>${consumerNav()}</div>`}
function profile(){const farmer=state.role==='farmer';return `<div class="screen">${header('Profile',farmer?'Farmer account · 520008':'Consumer account · 520008')}<div class="container"><div class="card" style="padding:18px;background:var(--green);color:#fff"><div class="row"><div><div style="font-size:21px;font-weight:950">${farmer?'Lakshmi Reddy':'Jennith'}</div><div style="margin-top:3px;opacity:.9">+91 98765 43210</div><span class="badge" style="margin-top:7px;background:#e4f0ff;color:#2d67a5">Accepted</span></div><div style="width:64px;height:64px;border-radius:50%;background:#fff3c9;color:var(--green);display:grid;place-items:center;font-weight:950;font-size:20px">${farmer?'LR':'JK'}</div></div></div><div class="card" style="padding:0;margin-top:14px;overflow:hidden"><div class="row" style="padding:15px;border-bottom:1px solid var(--line)"><div><b>App language</b><div class="muted" style="font-size:11px">యాప్ భాష</div></div><div class="chips"><button class="chip active">EN</button><button class="chip">TE</button></div></div><div class="row" style="padding:15px;border-bottom:1px solid var(--line)"><div><div class="muted" style="font-size:11px">Pincode</div><b>520008 · Vijayawada</b></div><span>›</span></div><div class="row" style="padding:15px;border-bottom:1px solid var(--line)"><div><div class="muted" style="font-size:11px">${farmer?'Farm location':'Delivery location'}</div><b>${farmer?'Poranki, 4.8 km away':'520008, Vijayawada'}</b></div><span>›</span></div>${farmer?`<div class="row" style="padding:15px;border-bottom:1px solid var(--line)"><div><div class="muted" style="font-size:11px">KYC verification</div><b>Verified farmer</b></div><span>›</span></div><button class="row" style="width:100%;padding:15px;border:0;background:#fff;text-align:left" onclick="switchRole()"><div><div class="muted" style="font-size:11px">Role</div><b>Switch to Consumer</b></div><span>›</span></button>`:`<button class="row" style="width:100%;padding:15px;border:0;background:#fff;text-align:left" onclick="switchRole()"><div><div class="muted" style="font-size:11px">Role</div><b>Switch to Farmer</b></div><span>›</span></button>`}</div>${farmer?`<div class="forecast-banner" style="margin-top:14px"><div style="font-weight:900">My farm <span style="float:right;color:var(--green)">Edit</span></div><div class="desc">2.5 acres · Tomatoes, leafy greens & banana · Joined Aug 2026</div></div>`:''}<button class="btn danger block" style="margin-top:14px" onclick="logout()">⇱ Log out<br><small>లాగ్ అవుట్</small></button></div>${farmer?farmerNav():consumerNav()}</div>`}
function payment(){const items=cartItems();const subtotal=items.reduce((s,x)=>s+x.p.price*x.qty,0),savings=items.length?16:0,total=subtotal-savings;return `<div class="screen">${header('Payment','Secure mock checkout',true)}<div class="container"><div class="pay-total"><div class="tiny">TOTAL TO PAY</div><div class="big">${money(total)}</div><div class="tiny">Order #FQ-2841 · ${items.reduce((s,x)=>s+x.qty,0)} kg</div></div><h3 style="margin:18px 0 12px">Choose payment method</h3><div class="stack"><button class="method ${state.payMethod==='UPI'?'selected':''}" onclick="state.payMethod='UPI';render()"><div class="method-icon">▣</div><div class="method-text"><div class="method-title">UPI</div><div class="method-sub">Google Pay · PhonePe · Paytm</div></div><div class="radio"></div></button><div class="grid2"><button class="btn secondary" onclick="state.payMethod='UPI';toast('GPay selected')">GPay</button><button class="btn secondary" onclick="state.payMethod='UPI';toast('PhonePe selected')">PhonePe</button></div><button class="method ${state.payMethod==='POD'?'selected':''}" onclick="state.payMethod='POD';render()"><div class="method-icon" style="background:#f0f5f0;color:var(--green)">₹</div><div class="method-text"><div class="method-title">Pay on Delivery</div><div class="method-sub">Pay cash or UPI at community pickup</div></div><div class="radio"></div></button></div><div class="forecast-banner" style="margin-top:14px">ⓘ This is a mock payment screen. No real payment gateway is connected.</div><div class="card summary" style="margin-top:14px"><div class="summary-line"><span>Order total</span><b>${money(subtotal)}</b></div><div class="summary-line"><span>Payment fee</span><b>₹0</b></div><div class="summary-line total"><span>Pay now</span><b style="color:var(--green)">${money(total)}</b></div></div><button class="btn primary block" style="margin-top:14px" onclick="payNow()">♧ Pay Now · ${money(total)}<br><small>ఇప్పుడే చెల్లించండి</small></button><div class="small-note" style="margin-top:12px">Mock only · No Razorpay or real gateway</div></div></div>`}
function openAddProduce(){state.uploadUrl='';state.uploadSource='';document.getElementById('modal').classList.add('show')}
function sourceBadge(p){if(!p)return '';if(p.imageSource==='photo')return `<span class="badge">Farmer photo</span>`;if(p.imageSource==='ai')return `<span class="badge yellow">AI illustration</span>`;if(p.img&&p.img!=='icon.svg')return `<span class="badge">Illustrative image</span>`;return ''}
function closeModal(){document.getElementById('modal').classList.remove('show')}
async function addListing(){const name=document.getElementById('f-name').value.trim();const price=Number(document.getElementById('f-price').value);const qty=Number(document.getElementById('f-qty').value);if(!name||!Number.isFinite(price)||price<0||!Number.isFinite(qty)||qty<=0){toast('Enter a product, valid price, and quantity');return}try{const imageUrl=(document.getElementById('f-url')?.value.trim()||state.uploadUrl||'').trim();const imageSource=imageUrl?(state.uploadSource||'url'):'';const created=await createListing({productName:name,category:'Veg',price,quantity:qty,harvestedAt:new Date().toISOString(),location:state.user?.location||'Poranki',pincode:state.user?.pincode||'',...(imageUrl?{imageUrl,imageSource}:{})});state.uploadUrl='';state.uploadSource='';state.listings.unshift(normalizeListing(created));closeModal();state.screen='listings';toast('Listing published');render()}catch(error){toast(error.message)}}
async function editListing(id){const listing=state.listings.find(item=>item.id===id);if(!listing)return;const quantity=prompt('Update available quantity (kg)',listing.qty);if(quantity===null)return;const value=Number(quantity);if(!Number.isFinite(value)||value<0){toast('Enter a valid stock quantity');return}try{const updated=await updateListing(id,{quantity:value});state.listings=state.listings.map(item=>item.id===id?normalizeListing(updated):item);render();toast('Listing updated')}catch(error){toast(error.message)}}
async function deleteListing(id){if(!confirm('Delete this listing?'))return;try{await deleteListingRequest(id);state.listings=state.listings.filter(item=>item.id!==id);products=products.filter(item=>item.id!==id);render();toast('Listing deleted')}catch(error){toast(error.message)}}
async function adjustTomato(){const listing=state.listings.find(item=>item.name.toLowerCase()==='tomato');if(!listing){toast('Create a tomato listing first');return}try{const updated=await updateListing(listing.id,{quantity:52});state.listings=state.listings.map(item=>item.id===listing.id?normalizeListing(updated):item);render();toast('Tomato listing adjusted to 52 kg')}catch(error){toast(error.message)}}
async function addToCart(id,qty=1,open=false){const desired=open?Number(qty):Number(state.cart[id]||0)+Number(qty);try{await addCartItem(id,desired);state.cart[id]=desired;toast('Added to cart');if(open)state.screen='cart';render()}catch(error){toast(error.message)}}
async function changeQty(id,delta){const next=Math.max(0,Number(state.cart[id]||2)+delta);try{if(next===0){await removeCartItem(id);delete state.cart[id]}else{await updateCartItem(id,next);state.cart[id]=next}render()}catch(error){toast(error.message)}}
async function removeFromCart(id){try{await removeCartItem(id);delete state.cart[id];toast('Removed from cart');render()}catch(error){toast(error.message)}}
function joinGroup(name){if(!state.joined.includes(name)){state.joined.push(name);persist();toast(`Joined ${name}`)}else toast(`Already joined ${name}`);render()}
async function payNow(){if(!cartItems().length){toast('Your cart is empty');return}try{const order=await createOrder({paymentMethod:state.payMethod==='POD'?'COD':'UPI_MOCK',fulfillment:'DELIVERY',pincode:state.user?.pincode||''});state.cart={};state.orders.unshift({id:order.orderId,status:order.status,items:order.items.map(item=>`${item.productName} ${item.quantity}kg · ${item.farmerName}`).join(' · '),amount:order.total,paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,raw:order});state.screen='orders';toast(order.paymentMethod==='COD'?'COD order placed':'Order placed; UPI is not charged in this prototype');await refreshMarketplace();render()}catch(error){toast(error.message)}}
async function reorder(id){const order=state.orders.find(item=>item.id===id);if(!order?.raw)return;try{for(const item of order.raw.items)await addCartItem(item.listingId,item.quantity);await refreshMarketplace();state.screen='cart';render()}catch(error){toast(error.message)}}
function switchRole(){clearSession();state.user=null;state.role=null;state.cart={};state.orders=[];state.listings=[];state.screen='role';render()}
function logout(){clearSession();state.user=null;state.role=null;state.cart={};state.orders=[];state.listings=[];state.screen='role';render()}
function modal(){return `<div id="modal" class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="row"><h3>Add produce</h3><button class="icon-btn" onclick="closeModal()">×</button></div><div class="form-grid"><div class="full"><label class="muted">Produce name</label><input id="f-name" class="input" placeholder="e.g. Tomato"></div><div><label class="muted">Price / kg</label><input id="f-price" class="input" type="number" value="32"></div><div><label class="muted">Quantity / kg</label><input id="f-qty" class="input" type="number" value="20"></div><div class="full"><label class="muted">Product photo (optional)</label><div class="row" style="margin-bottom:8px"><button type="button" class="btn secondary" onclick="document.getElementById('f-camera').click()">Take photo</button><button type="button" class="btn secondary" onclick="document.getElementById('f-photo').click()">Choose photo</button></div><input id="f-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onchange="uploadPhotoUI(this)"><input id="f-photo" type="file" accept="image/jpeg,image/png,image/webp" hidden onchange="uploadPhotoUI(this)"><input id="f-url" class="input" style="margin-top:8px" placeholder="Photo URL (https)" oninput="state.uploadUrl=this.value;state.uploadSource=''"><div class="muted" style="font-size:11px;margin-top:6px">Your photos appear first. AI imagery is not connected; illustrations are labeled.</div></div></div><button class="btn primary block" style="margin-top:14px" onclick="addListing()">Save listing</button></div></div>`}
function render(){let body;if(!state.role)body=roleScreen();else if(state.screen==='farmerHome')body=farmerHome();else if(state.screen==='listings')body=listings();else if(state.screen==='bulkOrders')body=bulkOrders();else if(state.screen==='forecast')body=forecast();else if(state.screen==='consumerHome')body=consumerHome();else if(state.screen==='search')body=searchScreen();else if(state.screen==='product'&&state.selectedProduct)body=productDetail(state.selectedProduct);else if(state.screen==='bulkGroups')body=bulkGroups();else if(state.screen==='cart')body=cart();else if(state.screen==='orders')body=orders();else if(state.screen==='profile')body=profile();else if(state.screen==='payment')body=payment();else if(state.screen==='addressPicker')body=addressPicker();else if(state.screen==='addressForm')body=addressForm();else body=state.role==='farmer'?farmerHome():consumerHome();document.getElementById('app').innerHTML=`<div class="app-shell">${body}${modal()}${orderDetailModal()}</div>`}
function selectedOrderEntry(){return state.orders.find((o)=>o.id===state.selectedOrderId)||null}
function openOrderDetail(id){state.selectedOrderId=id;render()}
function closeOrderDetail(){state.selectedOrderId='';render()}
function orderDetailModal(){
 const entry=selectedOrderEntry();
 if(!entry||!entry.raw)return '';
 const raw=entry.raw;
 const isFarmer=state.role==='farmer';
 const indexes=isFarmer&&entry.itemIndexes?.length?entry.itemIndexes:raw.items.map((_,i)=>i);
 const photoFor=(listingId)=>{const fromMarket=(products||[]).find((p)=>p.id===listingId);const fromFarm=(state.listings||[]).find((p)=>p.id===listingId);const img=fromMarket?.img||fromFarm?.img;return img&&img!=='icon.svg'?`${ASSET+img}`:''};
 const rows=indexes.map((index)=>{const item=raw.items[index];if(!item)return '';const photo=photoFor(item.listingId);return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">${photo?`<img src="${photo}" style="width:52px;height:52px;border-radius:10px;object-fit:cover" alt="">`:''}<div style="flex:1"><b>${escapeHtml(item.productName)}</b><div class="muted" style="font-size:12px">${item.quantity}kg · ${escapeHtml(item.farmerName||'')} · ${money(item.priceAtPurchase)}/kg</div></div><b>${money(item.subtotal)}</b></div>`}).join('');
 const lat=Number(raw.deliveryLat),lng=Number(raw.deliveryLng);
 const hasCoords=Number.isFinite(lat)&&Number.isFinite(lng);
 const addrText=[raw.address,raw.pincode].filter(Boolean).join(' · ');
 return `<div class="modal-back show" onclick="if(event.target===this)closeOrderDetail()"><div class="modal"><div class="row"><h3>Order details</h3><button class="icon-btn" onclick="closeOrderDetail()">×</button></div><div class="muted" style="font-size:12px">Order #${escapeHtml(raw.orderId)} · Order date: ${new Date(raw.createdAt||Date.now()).toLocaleString()}</div><div style="margin:8px 0"><span class="badge blue">${escapeHtml(entry.status||raw.status||'')}</span> <span class="badge">${raw.paymentMethod==='COD'?'Cash on Delivery':'UPI · Mock'} · ${raw.paymentStatus==='PAID'?'Paid':'Payment pending'}</span></div><h3 style="margin:14px 0 4px">Items</h3>${rows}<div class="card summary" style="margin-top:14px"><div class="summary-line"><span>Product subtotal</span><b>${money(raw.subtotal)}</b></div><div class="summary-line"><span>Delivery fee (${state.feePercent}%)</span><b>${money(raw.deliveryFee||0)}</b></div><div class="summary-line total"><span>Total payable</span><b style="color:var(--green)">${money(raw.total)}</b></div></div><h3 style="margin:14px 0 4px">Delivery address</h3><p class="muted">${escapeHtml(addrText||'Not provided')}${raw.addressLabel?` · ${escapeHtml(raw.addressLabel)}`:''}</p><p class="muted">${isFarmer?escapeHtml(entry.consumer||raw.consumerName||''):escapeHtml(raw.consumerName||'')}</p>${hasCoords?`<div id="ordermap-modal" class="map-box small" style="margin-top:10px"></div><div class="row" style="margin-top:10px"><button class="btn secondary" onclick="toggleOrderMap('modal',${lat},${lng})">View map</button>${isFarmer?`<a class="btn primary" href="${directionsUrl(lat,lng)}" target="_blank" rel="noopener">Get Directions</a>`:''}</div>`:''}<button class="btn secondary block" style="margin-top:16px" onclick="closeOrderDetail()">Close</button></div></div>`;
}

function localizeText(source){if(state.language==='en')return source.replace(/[\u0C00-\u0C7F]/g,'');let result=source;const pairs=Object.keys(en).filter(key=>key!=='appName'&&typeof en[key]==='string'&&te[key]&&en[key]!==te[key]).map(key=>[en[key],te[key]]).sort((a,b)=>b[0].length-a[0].length);for(const [english,telugu] of pairs){const escaped=english.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const matcher=new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,'giu');result=result.replace(matcher,(_match,prefix)=>`${prefix}${telugu}`)}return result}
function localizeRenderedUI(){const root=document.getElementById('app');document.documentElement.lang=state.language;document.documentElement.dataset.language=state.language;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const textNodes=[];while(walker.nextNode())textNodes.push(walker.currentNode);for(const node of textNodes){if(state.language==='te'&&/^[\s\u0C00-\u0C7F]+$/.test(node.nodeValue)&&node.parentElement?.closest('.role-te,small')){node.parentElement.closest('.role-te,small').remove();continue}node.nodeValue=localizeText(node.nodeValue)}for(const element of root.querySelectorAll('[placeholder],[aria-label],[title]')){for(const attribute of ['placeholder','aria-label','title'])if(element.hasAttribute(attribute))element.setAttribute(attribute,localizeText(element.getAttribute(attribute)))}root.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.language)))}
const localizeRenderedUIOriginal=localizeRenderedUI;
localizeRenderedUI=()=>{localizeRenderedUIOriginal();const root=document.getElementById('app');if(state.language==='te'){const heading=root.querySelector('.role-heading');if(heading)heading.textContent=te.rolePrompt;const descriptions=root.querySelectorAll('.role-desc');if(descriptions[0])descriptions[0].textContent=te.farmerRoleDesc;if(descriptions[1])descriptions[1].textContent=te.consumerRoleDesc}document.querySelectorAll('#app [data-language]').forEach(button=>button.textContent=button.dataset.language==='en'?en.english:te.telugu)};
function setLanguage(language){state.language=language==='te'?'te':'en';localStorage.setItem('farmiqo-language',state.language);render()}
function farmerOrderActions(order){const actions={ORDER_PLACED:[['FARMER_ACCEPTED','Accept'],['FARMER_REJECTED','Reject']],FARMER_ACCEPTED:[['PREPARING','Preparing']],PREPARING:[['READY_FOR_PICKUP','Ready for pickup'],['OUT_FOR_DELIVERY','Dispatch']],READY_FOR_PICKUP:[['DELIVERED','Mark delivered'],['OUT_FOR_DELIVERY','Dispatch']],OUT_FOR_DELIVERY:[['DELIVERED','Mark delivered']]};return (actions[order.rawStatus]||[]).map(([status,label])=>`<button class="btn ${status==='FARMER_REJECTED'?'danger':'primary'} small" type="button" onclick="updateFarmerOrder('${order.id}','${status}')">${label}</button>`).join('')}
async function updateFarmerOrder(orderId,status){try{await updateOrderStatus(orderId,status);await refreshFarmerData();toast(status==='FARMER_ACCEPTED'?'Order accepted':'Order status updated')}catch(error){toast(error.message)}}
const farmerOrderCard=(order)=>`<article class="card group-card"><div class="group-row"><div><div class="group-title">#${order.id}</div><div class="group-sub">${order.consumer||'Consumer'} · ${order.rawStatus.replaceAll('_',' ')}</div></div><span class="badge blue">${order.paymentMethod==='COD'?'COD · Pending':'UPI · Mock'}</span></div><div class="order-meta" style="margin-top:12px">${order.items}</div><div class="muted" style="font-size:12px;margin-top:8px">${order.addressText||''}</div>${order.hasCoords?`<div style="margin-top:10px"><div class="row"><button class="btn secondary" onclick="toggleOrderMap('${order.id}',${order.deliveryLat},${order.deliveryLng})">View map</button><a class="btn primary" href="${directionsUrl(order.deliveryLat,order.deliveryLng)}" target="_blank" rel="noopener">Get Directions</a></div><div id="ordermap-${order.id}" class="map-box small" style="display:none;margin-top:10px"></div></div>`:''}<div class="row" style="margin-top:14px"><strong class="price">${money(order.amount)}</strong><div style="display:flex;gap:8px;align-items:center"><button class="btn secondary small" onclick="openOrderDetail('${order.id}')">View Details</button><div class="inline-order-actions">${farmerOrderActions(order)}</div></div></div></article>`;
function directionsUrl(lat, lng) { return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`; }
async function toggleOrderMap(orderId, lat, lng) {
  const el = document.getElementById(`ordermap-${CSS.escape(orderId)}`);
  if (!el) return;
  if (el.style.display !== 'none') { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  try {
    const L = await loadLeaflet();
    const map = L.map(el, { dragging: true, scrollWheelZoom: false }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
    L.marker([lat, lng], { icon: pinIcon(L) }).addTo(map);
  } catch { el.innerHTML = '<div class="muted" style="font-size:12px">Map could not load.</div>'; }
}
const farmerOrdersList=()=>state.orders.length?`<div class="stack" style="margin-top:14px">${state.orders.map(farmerOrderCard).join('')}</div>`:`<div class="empty"><h3>No orders yet</h3><p>New consumer orders will appear here.</p></div>`;
const farmerOrdersView=()=>`<div class="screen">${header('Bulk orders','Orders assigned to your farm')}<div class="container"><div class="section-title">Incoming orders</div><div style="margin-top:14px">${farmerOrdersList()}</div></div>${farmerNav()}</div>`;
bulkOrders=farmerOrdersView;
const consumerOrdersView=()=>`<div class="screen">${header('Orders','Track your farm orders')}<div class="container">${state.orders.length?`<div class="stack">${state.orders.map(order=>{const statuses=['ORDER_PLACED','FARMER_ACCEPTED','PREPARING',order.raw?.fulfillment==='PICKUP'?'READY_FOR_PICKUP':'OUT_FOR_DELIVERY','DELIVERED'];const activeIndex=Math.max(0,statuses.indexOf(order.rawStatus));return `<article class="card" style="padding:16px"><div class="row"><div><b>#${order.id}</b><div class="muted" style="font-size:12px">${new Date(order.raw?.createdAt||Date.now()).toLocaleString()}</div></div><span class="badge blue">${order.status}</span></div><div class="muted" style="font-size:13px;margin-top:14px">${order.items}</div><div class="timeline">${statuses.map((status,index)=>`<div class="timeline-step ${index<=activeIndex?'done':''}"><div class="dot"></div><div class="timeline-label">${status.replaceAll('_',' ')}</div></div>`).join('')}</div><div class="row" style="margin-top:14px"><div><b style="color:var(--green)">${money(order.amount)}</b><div class="muted" style="font-size:12px">${order.paymentMethod==='COD'?'Cash on Delivery': 'UPI · Mock'} · ${order.paymentStatus==='PAID'?'Paid':'Payment pending'}</div></div></div></article>`}).join('')}</div>`:`<div class="empty"><h3>No orders yet</h3><p>Orders you place will appear here with live updates.</p><button class="btn primary" onclick="setScreen('consumerHome')">Browse produce</button></div>`}</div>${consumerNav()}</div>`;
orders=consumerOrdersView;

document.addEventListener('click',e=>{const card=e.target.closest('.product-card');if(card && !e.target.closest('button')){ /* no-op */ };
});
window.openProduct=(id)=>{state.selectedProduct=products.find(p=>p.id===id);state.screen='product';render()};
// Make product cards open on title/image click without breaking Add.
const oldProductCard=productCard;window.productCard=(p)=>oldProductCard(p).replace('<div class="product-title">','<div class="product-title" onclick="openProduct(\''+p.id+'\')" style="cursor:pointer">').replace('<img src="${ASSET+x.p.img}">','');
const originalProfileScreen=profile;
profile=()=>originalProfileScreen().replace('<button class="chip active">EN</button><button class="chip">TE</button>',`<button class="chip ${state.language==='en'?'active':''}" data-language="en">${en.english}</button><button class="chip ${state.language==='te'?'active':''}" data-language="te">${te.telugu}</button>`);
const originalPaymentScreen=payment;
payment=()=>{const items=cartItems();const subtotal=items.reduce((sum,item)=>sum+item.p.price*item.qty,0);const discounted=Math.max(0,subtotal-(items.length?16:0));let view=originalPaymentScreen().replaceAll(money(discounted),money(subtotal));if(state.payMethod==='POD')view=view.replace('Pay Now ·','Place COD order ·');return view.replace(/Order #FQ-2841 · /,'')};
const renderUntranslated=render;
const decorativeIcons=new Map([['🌾','Wheat'],['🌱','Sprout'],['🚜','Tractor'],['🧺','ShoppingBasket'],['🛒','ShoppingCart'],['🚚','Truck'],['⌂','House'],['☷','ClipboardList'],['◈','Package'],['▥','BarChart3'],['♙','UserRound'],['⌕','Search'],['♧','UsersRound'],['♡','Heart'],['⌁','CircleUserRound'],['＋','Plus'],['⌫','Trash2'],['‹','ArrowLeft'],['›','ChevronRight'],['→','ArrowRight'],['✓','Check'],['▣','CalendarDays'],['◉','MapPin'],['◷','Clock'],['☆','Star'],['⌄','ChevronDown'],['▦','Grid2X2'],['◌','Apple'],['◍','Carrot'],['◐','LeafyGreen'],['✣','Sprout']]);
function renderDecorativeIcons(){const root=document.getElementById('app');let markup=root.innerHTML;for(const [glyph,name] of decorativeIcons)markup=markup.split(glyph).join(icon(name));root.innerHTML=markup;root.querySelectorAll('.header .icon-btn').forEach(button=>button.setAttribute('aria-label',button.getAttribute('onclick')?.includes('goBack')?en.back:en.openProfile));root.querySelectorAll('.trash').forEach(button=>button.setAttribute('aria-label',en.removeItem))}
let deferredInstallPrompt=null;
async function installApp(){if(!deferredInstallPrompt)return;const promptEvent=deferredInstallPrompt;deferredInstallPrompt=null;await promptEvent.prompt();const choice=await promptEvent.userChoice;toast(choice.outcome==='accepted'?en.installStarted:en.installDismissed);render()}
function renderInstallControl(){if(!deferredInstallPrompt)return;const screen=document.querySelector('#app .screen');if(!screen)return;const button=document.createElement('button');button.className='install-app-btn';button.type='button';button.innerHTML=`${icon('Download',18)}<span>${dictionaries[state.language]?.installApp||en.installApp}</span>`;button.addEventListener('click',installApp);const anchor=screen.querySelector('.container')||screen.querySelector('.role-heading')||screen.querySelector('.hero-logo');anchor?.before(button)}
render=()=>{renderUntranslated();document.querySelectorAll('#app img').forEach((image)=>{const src=image.getAttribute('src')||'';if(src.startsWith('/assets/https://')||src.startsWith('/assets/http://'))image.setAttribute('src',src.slice(8));else if(src==='/assets/icon.svg')image.setAttribute('src','/icon.svg')});renderDecorativeIcons();renderInstallControl();localizeRenderedUI();if(state.screen==='addressPicker')void initPickerMap().catch(()=>{})};
function openAddressPicker(mode, editId = '', groupId = '') {
  const existing = editId ? state.addresses.find((a) => a.id === editId) : null;
  const center = defaultCenter();
  if (existing) {
    state.mapDraft = { lat: existing.lat, lng: existing.lng };
    state.addrForm = { label: existing.label, house: existing.house, street: existing.street, area: existing.area, landmark: existing.landmark, pincode: existing.pincode, phone: existing.phone, editingId: existing.id };
  } else if (mode === 'farm' && Number.isFinite(state.user?.farmLat) && Number.isFinite(state.user?.farmLng)) {
    state.mapDraft = { lat: state.user.farmLat, lng: state.user.farmLng };
    state.addrForm = { label: 'Home', house: '', street: '', area: '', landmark: '', pincode: state.user?.pincode || '', phone: state.user?.phone || '', editingId: '' };
  } else {
    state.mapDraft = { lat: center.lat, lng: center.lng };
    state.addrForm = { label: 'Home', house: '', street: '', area: '', landmark: '', pincode: state.user?.pincode || '', phone: state.user?.phone || '', editingId: '' };
  }
  state.mapCtx = { mode, editId: existing ? existing.id : '', groupId };
  state.screen = 'addressPicker';
  render();
}
async function initPickerMap() {
  const el = document.getElementById('farmiqo-map');
  if (!el || !state.mapDraft) return;
  try {
    const L = await loadLeaflet();
    destroyMap();
    const draft = state.mapDraft;
    activeMap = L.map(el, { zoomControl: true }).setView([draft.lat, draft.lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(activeMap);
    activeMarker = L.marker([draft.lat, draft.lng], { draggable: true, icon: pinIcon(L) }).addTo(activeMap);
    activeMarker.on('dragend', () => {
      const pos = activeMarker.getLatLng();
      state.mapDraft = { lat: Math.round(pos.lat * 1e6) / 1e6, lng: Math.round(pos.lng * 1e6) / 1e6 };
      updateCoordsCaption();
    });
    activeMap.on('click', (e) => {
      state.mapDraft = { lat: Math.round(e.latlng.lat * 1e6) / 1e6, lng: Math.round(e.latlng.lng * 1e6) / 1e6 };
      activeMarker.setLatLng([state.mapDraft.lat, state.mapDraft.lng]);
      updateCoordsCaption();
    });
    updateCoordsCaption();
  } catch { toast('Map could not load. You can still type the address details below.'); }
}
function updateCoordsCaption() {
  const el = document.getElementById('map-coords');
  if (el && state.mapDraft) el.textContent = `${state.mapDraft.lat}, ${state.mapDraft.lng}`;
}
function addressPicker() {
  const back = state.mapCtx?.mode === 'farm' ? 'profile' : (state.mapCtx?.mode === 'bulkJoin' ? 'bulkGroups' : (state.role === 'consumer' ? 'profile' : 'farmerHome'));
  return `<div class="screen">${header('Choose on map', 'Move the pin to your exact spot', true)}<div class="container"><div class="search"><span class="ico">⌕</span><input id="map-search" class="input" placeholder="Search village, area, or pincode" oninput="pickerSearch(this.value)"></div><div id="map-results" style="margin-top:8px"></div><div class="row" style="margin:12px 0"><button class="btn secondary" onclick="useMyLocation()">Use my location</button><span id="map-coords" class="muted" style="font-size:12px"></span></div><div id="farmiqo-map" class="map-box"></div><div class="muted" style="font-size:11px;margin-top:6px">Map © OpenStreetMap contributors · Drag the pin or tap the map</div><button class="btn primary block" style="margin-top:14px" onclick="confirmPin()">Confirm this location</button><button class="auth-back" type="button" onclick="state.screen='${back}';render()">Cancel</button></div>${state.role === 'farmer' ? farmerNav() : consumerNav()}</div>`;
}
function addressForm() {
  const f = state.addrForm;
  return `<div class="screen">${header(f.editingId ? 'Edit address' : 'Address details', '', true)}<div class="container"><div class="card" style="padding:16px"><div class="muted" style="font-size:12px;margin-bottom:12px">Pinned at ${state.mapDraft ? `${state.mapDraft.lat}, ${state.mapDraft.lng}` : ''}${f.formattedGuess ? `<br>${escapeHtml(f.formattedGuess)}` : ''}</div><div class="chips" style="margin-bottom:12px">${['Home', 'College', 'Other'].map((l) => `<button class="chip ${f.label === l ? 'active' : ''}" onclick="state.addrForm.label='${l}';render()">${l}</button>`).join('')}</div><div class="form-grid"><div><label class="muted">House / building</label><input id="af-house" class="input" maxlength="120" value="${escapeHtml(f.house)}"></div><div><label class="muted">Street</label><input id="af-street" class="input" maxlength="160" value="${escapeHtml(f.street)}"></div><div><label class="muted">Village / area</label><input id="af-area" class="input" maxlength="160" value="${escapeHtml(f.area)}"></div><div><label class="muted">Landmark</label><input id="af-landmark" class="input" maxlength="160" value="${escapeHtml(f.landmark)}"></div><div><label class="muted">Pincode</label><input id="af-pincode" class="input" inputmode="numeric" maxlength="6" value="${escapeHtml(f.pincode)}"></div><div><label class="muted">Contact number</label><input id="af-phone" class="input" type="tel" maxlength="32" value="${escapeHtml(f.phone)}"></div></div><div id="addr-error" class="auth-error" role="alert"></div><button class="btn primary block" style="margin-top:14px" onclick="saveAddressUI()">Save address</button></div></div>${consumerNav()}</div>`;
}
async function saveAddressUI() {
  const values = {
    label: state.addrForm.label,
    house: document.getElementById('af-house').value.trim(),
    street: document.getElementById('af-street').value.trim(),
    area: document.getElementById('af-area').value.trim(),
    landmark: document.getElementById('af-landmark').value.trim(),
    pincode: document.getElementById('af-pincode').value.trim(),
    phone: document.getElementById('af-phone').value.trim() || state.user?.phone || '',
    lat: state.mapDraft?.lat,
    lng: state.mapDraft?.lng,
    formattedAddress: state.addrForm.formattedGuess || '',
  };
  try {
    const saved = state.addrForm.editingId
      ? await updateAddress(state.addrForm.editingId, values)
      : await createAddress(values);
    await refreshAddresses();
    state.selectedAddressId = saved.id;
    localStorage.setItem('farmiqo-last-address', saved.id);
    toast('Address saved');
    if (state.mapCtx?.mode === 'bulkJoin' && state.mapCtx?.groupId) { state.bulkJoinAddr[state.mapCtx.groupId] = saved.id; }
    state.screen = state.mapCtx?.mode === 'checkout' ? 'payment' : (state.mapCtx?.mode === 'bulkJoin' ? 'bulkGroups' : 'profile');
    render();
  } catch (error) { const t = document.getElementById('addr-error'); if (t) t.textContent = error.message; else toast(error.message); }
}
async function editAddressUI(id) { openAddressPicker('profile', id); }
function addressBookCard() {
  return `<div class="card" style="padding:16px;margin-top:14px"><div class="row"><h3 style="margin:0">My addresses</h3><button class="btn secondary" onclick="openAddressPicker('profile')">Add new</button></div><div class="stack" style="margin-top:12px">${state.addresses.length ? state.addresses.map((a) => `<div class="card" style="padding:12px"><div class="row"><div><b>${escapeHtml(a.label)}</b><div class="muted" style="font-size:12px">${escapeHtml(addressText(a))}</div></div><div style="display:flex;gap:8px"><button class="sm-btn edit" onclick="editAddressUI('${a.id}')">Edit</button><button class="sm-btn delete" onclick="removeAddressUI('${a.id}')">Delete</button></div></div></div>`).join('') : '<p class="muted">No saved addresses yet. Add one to speed up checkout.</p>'}</div></div>`;
}
function farmLocationCard() {
  const user = state.user || {};
  const has = Number.isFinite(user.farmLat) && Number.isFinite(user.farmLng);
  return `<div class="card" style="padding:16px;margin-top:14px"><div class="row"><h3 style="margin:0">Farm location</h3><button class="btn secondary" onclick="openAddressPicker('farm')">${has ? 'Update' : 'Set on map'}</button></div>${has ? `<div class="muted" style="font-size:12px;margin-top:8px">${escapeHtml(user.farmAddress || `${user.farmLat}, ${user.farmLng}`)}</div>` : '<p class="muted">Not set. Pin your farm so you can find it easily.</p>'}</div></div>`;
}
async function removeAddressUI(id) {
  if (!confirm('Delete this address?')) return;
  try {
    await deleteAddress(id);
    if (state.selectedAddressId === id) state.selectedAddressId = '';
    await refreshAddresses();
    render();
  } catch (error) { toast(error.message); }
}
let searchTimer = null;
function pickerSearch(query) {
  window.clearTimeout(searchTimer);
  const box = document.getElementById('map-results');
  if (!query || query.trim().length < 3) { if (box) box.innerHTML = ''; return; }
  searchTimer = window.setTimeout(async () => {
    try {
      const places = await searchPlaces(query.trim());
      const target = document.getElementById('map-results');
      if (!target) return;
      target.innerHTML = places.length
        ? places.map((p, i) => `<button type="button" class="search-result" data-i="${i}">${escapeHtml(p.display_name)}</button>`).join('')
        : '<div class="muted" style="font-size:12px">No matches. Try a village, area, or pincode.</div>';
      target.querySelectorAll('.search-result').forEach((btn) => btn.addEventListener('click', () => {
        const place = places[Number(btn.dataset.i)];
        if (!place) return;
        state.mapDraft = { lat: Number(place.lat), lng: Number(place.lon) };
        if (activeMap && activeMarker) {
          activeMap.setView([state.mapDraft.lat, state.mapDraft.lng], 16);
          activeMarker.setLatLng([state.mapDraft.lat, state.mapDraft.lng]);
        }
        updateCoordsCaption();
        target.innerHTML = '';
      }));
    } catch { const t = document.getElementById('map-results'); if (t) t.innerHTML = '<div class="muted" style="font-size:12px">Search is unavailable offline. Move the pin manually.</div>'; }
  }, 500);
}
function useMyLocation() {
  if (!('geolocation' in navigator)) { toast('Geolocation is not available on this device. Search or move the pin instead.'); return; }
  toast('Locating…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.mapDraft = { lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 };
      if (activeMap && activeMarker) {
        activeMap.setView([state.mapDraft.lat, state.mapDraft.lng], 16);
        activeMarker.setLatLng([state.mapDraft.lat, state.mapDraft.lng]);
      }
      updateCoordsCaption();
    },
    () => toast('Location permission was denied. Search for your area or move the pin manually.'),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
}
async function confirmPin() {
  if (!state.mapDraft) return;
  const { lat, lng } = state.mapDraft;
  if (state.mapCtx?.mode === 'farm') {
    try {
      let formatted = '';
      try { formatted = (await reversePlace(lat, lng)).display_name || ''; } catch {}
      const user = await updateProfile({ farmLat: lat, farmLng: lng, farmAddress: formatted.slice(0, 300) });
      state.user = user;
      localStorage.setItem('farmiqo-user', JSON.stringify(user));
      toast('Farm location saved');
    } catch (error) { toast(error.message); return; }
    state.screen = 'profile';
    render();
    return;
  }
  try {
    const place = await reversePlace(lat, lng);
    const addr = place.address || {};
    state.addrForm = {
      ...state.addrForm,
      area: addr.suburb || addr.village || addr.town || addr.city || state.addrForm.area,
      pincode: addr.postcode && /^\d{6}$/.test(addr.postcode) ? addr.postcode : state.addrForm.pincode,
    };
    state.addrForm.formattedGuess = place.display_name || '';
  } catch { state.addrForm.formattedGuess = ''; }
  state.screen = 'addressForm';
  render();
}
const originalRoleScreen=roleScreen;
const languagePicker=()=>`<div class="language-picker" aria-label="${en.appLanguage}"><button class="chip ${state.language==='en'?'active':''}" data-language="en">${en.english}</button><button class="chip ${state.language==='te'?'active':''}" data-language="te">${te.telugu}</button></div>`;
roleScreen=()=>state.screen==='forgot'?forgotScreen():state.screen==='reset'&&state.resetToken?resetScreen():state.screen==='auth'?authScreen().replace('<div class="hero-logo">',`${languagePicker()}<div class="hero-logo">`):originalRoleScreen().replace('<div class="role-foot">',`${languagePicker()}<div class="role-foot">`);
function checkResetHash(){const match=/^#reset=([A-Za-z0-9]+)/.exec(location.hash||'');if(match&&!state.role){state.resetToken=match[1];state.screen='reset';history.replaceState(null,'',location.pathname);render()}}
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const originalNormalizeListing=normalizeListing;
normalizeListing=(row)=>{
 const listing=originalNormalizeListing(row);
 listing.name=escapeHtml(row.productName||row.name);
 listing.farmer=escapeHtml(row.farmerName||row.farmer?.name||'');
 listing.distance=escapeHtml(row.location||row.farmer?.location||'');
 listing.cat=escapeHtml(row.category||'Veg');
 listing.description=escapeHtml(row.description||'');
  listing.img=resolveProductImage(row.productName||row.name,row.category||row.cat,row.img||row.imageUrl);
  listing.imageSource=row.imageSource||listing.imageSource||'';
  return listing;
};
const originalHeader=header;
header=(title,sub='',back=false)=>originalHeader(title,escapeHtml(String(sub).replace(/520008/g,state.user?.pincode||'Set pincode')),back);
farmerHome=()=>{
 const name=escapeHtml(state.user?.name||'Farmer');
 const active=state.listings.filter((item)=>item.status==='ACTIVE'&&item.qty>0).length;
 const lowStock=state.listings.filter((item)=>item.status==='ACTIVE'&&item.qty>0&&item.qty<=5).length;
 const needsAction=state.orders.filter((order)=>order.rawStatus==='ORDER_PLACED').length;
 const inventory=state.listings.filter((item)=>item.status!=='DELETED').reduce((sum,item)=>sum+item.qty,0);
 return `<div class="screen">${header(`Welcome, ${name}`,state.user?.farmName||state.user?.pincode||'Farmer account')}<div class="container"><div class="section-title">Your farm at a glance</div><div class="muted" style="font-size:13px;margin:4px 0 14px">${new Date().toLocaleDateString()}</div><div class="grid2"><div class="card stat"><div class="row"><span class="kicker">Active listings</span><span class="badge">🌱</span></div><div class="value">${active}</div><div class="sub">${lowStock} low in stock (5 kg or less)</div></div><div class="card stat"><div class="row"><span class="kicker">Orders needing action</span><span class="badge">♧</span></div><div class="value">${needsAction}</div><div class="sub">${inventory} kg listed inventory</div></div></div><button class="btn primary block add-produce" onclick="openAddProduce()">＋ Add Produce</button><div class="card order-mini" style="margin-top:14px"><div><b>Order activity</b><div class="order-meta">${state.orders.length} orders associated with your account</div></div><button class="sm-btn edit" onclick="setScreen('orders')">View orders</button></div></div>${farmerNav()}</div>`;
};
listings=()=>{
 const query=state.search.toLowerCase();
 const rows=state.listings.filter((item)=>!query||item.name.toLowerCase().includes(query));
 const active=state.listings.filter((item)=>item.status==='ACTIVE'&&item.qty>0).length;
 return `<div class="screen">${header('My listings',`${active} active · ${state.listings.length} total`)}<div class="container"><div class="row" style="margin-bottom:12px"><div class="search" style="flex:1"><span class="ico">⌕</span><input class="input" placeholder="Search listings" value="${escapeHtml(state.search)}" oninput="state.search=this.value;render()"></div><button class="btn primary" style="width:48px;padding:0" onclick="openAddProduce()">＋</button></div>${rows.length?`<div class="stack">${rows.map((item)=>`<div class="card listing"><img src="${ASSET+item.img}"><div class="listing-main"><div class="row"><div style="font-weight:900;font-size:17px">${item.name}</div><span class="badge">${item.status==='ACTIVE'?(item.qty?'Active':'Out of stock'):item.status}</span></div><div class="qty">${item.qty} kg left</div><div class="price">${money(item.price)}/${escapeHtml(item.priceUnit||'kg')}</div><div class="actions"><button class="sm-btn edit" onclick="editListing('${item.id}')">Edit</button><button class="sm-btn delete" onclick="deleteListing('${item.id}')">Delete</button></div></div></div>`).join('')}</div>`:'<div class="card" style="padding:18px">No listings yet. Add your first produce listing.</div>'}</div>${farmerNav()}</div>`;
};
bulkOrders=()=>{
  const activeListings=state.listings.filter((item)=>item.status==='ACTIVE');
  const f=state.offerForm;
  const offerForm=`<div class="card" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 12px">Create bulk offer</h3>${activeListings.length?`<div class="form-grid"><div class="full"><label class="muted">Listing</label><select id="offer-listing" class="input" oninput="state.offerForm.listingId=this.value">${activeListings.map((item)=>`<option value="${item.id}"${f.listingId===item.id?' selected':''}>${item.name} · ${item.qty} kg</option>`).join('')}</select></div><div><label class="muted">Target quantity (kg)</label><input id="offer-target" class="input" type="number" min="1" value="${escapeHtml(f.target)}" oninput="state.offerForm.target=this.value"></div><div><label class="muted">Min per person (kg)</label><input id="offer-min" class="input" type="number" min="0.01" step="0.5" value="${escapeHtml(f.min)}" oninput="state.offerForm.min=this.value"></div><div><label class="muted">Max per person (kg, optional)</label><input id="offer-max" class="input" type="number" min="0.01" step="0.5" value="${escapeHtml(f.max)}" oninput="state.offerForm.max=this.value"></div><div><label class="muted">Delivery date (optional)</label><input id="offer-slot" class="input" type="date" value="${escapeHtml(f.slot)}" oninput="state.offerForm.slot=this.value"></div><div class="full"><label class="muted">Delivery note (optional)</label><input id="offer-note" class="input" maxlength="300" value="${escapeHtml(f.note)}" oninput="state.offerForm.note=this.value"></div></div><button class="btn primary block" style="margin-top:14px" onclick="createBulkOfferUI()">Publish offer</button>`:'<p class="muted">Create a produce listing first.</p>'}</div>`;
  const offers=state.bulkOffers.length?`<div class="stack">${state.bulkOffers.map((g)=>{const pct=Math.min(100,Math.round(g.collectedQuantity/g.targetQuantity*100));return `<article class="card group-card"><div class="group-row"><div><div class="group-title">${escapeHtml(g.productName)}</div><div class="group-sub">${escapeHtml(g.status.replaceAll('_',' '))} · ${g.participantCount} participants</div></div><span class="badge ${g.status==='OPEN'?'':'blue'}">${escapeHtml(g.status)}</span></div><div style="font-size:13px;font-weight:900;margin-top:14px">${g.collectedQuantity}/${g.targetQuantity} kg pooled</div><div class="progress"><span style="width:${pct}%"></span></div>${g.deliveryInfo?`<div class="muted" style="font-size:12px;margin-top:8px">${escapeHtml(g.deliveryInfo)}</div>`:''}<div class="muted" style="font-size:12px;margin-top:4px">Delivery · cash on delivery</div>${g.assignedFarmerName?`<div class="muted" style="font-size:12px;margin-top:4px">Supplied by ${escapeHtml(g.assignedFarmerName)}</div>`:''}<div class="muted" style="font-size:12px;margin-top:8px">${g.participants.map((p)=>`${escapeHtml(p.consumerName)} · ${p.quantity}kg${p.address?` · ${escapeHtml([p.address, p.pincode].filter(Boolean).join(' · '))}`:''}`).join('<br>')||'No participants yet'}</div>${['OPEN','TARGET_REACHED','ASSIGNED','AGGREGATED'].includes(g.status)?`<div class="row" style="margin-top:14px"><div style="display:flex;gap:8px;flex-wrap:wrap">${['TARGET_REACHED','ASSIGNED','AGGREGATED'].includes(g.status)?`<button class="btn primary" onclick="fulfilBulkGroupUI('${g.groupId}')">Confirm delivery orders</button>`:''}${g.assignedFarmerId&&g.assignedFarmerId===state.user?.id&&g.farmerId!==state.user?.id?`<button class="btn secondary" onclick="unassignBulkGroupUI('${g.groupId}')">Release</button>`:''}<button class="btn danger" onclick="cancelBulkGroupUI('${g.groupId}')">Cancel offer</button></div></div>`:''}</article>`}).join('')}</div>`:'<div class="card" style="padding:18px">No bulk offers yet. Use the form on this screen to create your first bulk offer.</div>';
  const requests=state.communityRequests.length?`<div class="stack">${state.communityRequests.map((g)=>{const pct=Math.min(100,Math.round(g.collectedQuantity/g.targetQuantity*100));return `<article class="card group-card"><div class="group-row"><div><div class="group-title">${escapeHtml(g.productName)}</div><div class="group-sub">${g.collectedQuantity}/${g.targetQuantity} kg pooled · ${g.participantCount} participants</div></div><span class="badge">${escapeHtml(g.status)}</span></div><div class="progress" style="margin-top:12px"><span style="width:${pct}%"></span></div><div class="muted" style="font-size:12px;margin-top:8px">Delivery · ${escapeHtml(g.pincode||'')}</div><div class="row" style="margin-top:14px"><button class="btn primary" onclick="assignBulkGroupUI('${g.groupId}')">Supply this group</button></div></article>`}).join('')}</div>`:'<div class="card" style="padding:18px">No open community requests right now.</div>';
  return `<div class="screen">${header('Bulk orders','Offers and orders for your farm')}<div class="container"><div class="section-title">My bulk offers</div><div style="margin-top:12px">${offerForm}</div><div style="margin:18px 0 12px">${offers}</div><div class="section-title" style="margin-top:22px">Community requests</div><p class="muted">Open community groups you can supply. You need a matching active listing with enough stock.</p><div style="margin-top:12px">${requests}</div><div class="section-title" style="margin-top:22px">Incoming orders</div><div style="margin-top:12px">${farmerOrdersList()}</div></div>${farmerNav()}</div>`;
};
bulkGroups=()=>{
  const mine=(id)=>state.bulkGroups.find((g)=>g.groupId===id)?.participants.some((p)=>p.consumerId===state.user?.id);
  const all=state.bulkGroups.filter((g)=>g.status==='OPEN'||mine(g.groupId));
  const visible=state.groupFilter==='Joined'?all.filter((g)=>mine(g.groupId)):state.groupFilter==='Open'?all.filter((g)=>g.status==='OPEN'):all;
  const gf=state.groupForm;
  const groupForm=`<div class="card" style="padding:16px;margin-top:14px"><h3 style="margin:0 0 12px">Start a community group</h3><div class="form-grid"><div class="full"><label class="muted">Produce name</label><input id="cg-product" class="input" maxlength="120" value="${escapeHtml(gf.product)}" oninput="state.groupForm.product=this.value"></div><div><label class="muted">Target quantity (kg)</label><input id="cg-target" class="input" type="number" min="1" value="${escapeHtml(gf.target)}" oninput="state.groupForm.target=this.value"></div><div><label class="muted">Min per person (kg)</label><input id="cg-min" class="input" type="number" min="0.01" step="0.5" value="${escapeHtml(gf.min)}" oninput="state.groupForm.min=this.value"></div><div><label class="muted">Max per person (optional)</label><input id="cg-max" class="input" type="number" min="0.01" step="0.5" value="${escapeHtml(gf.max)}" oninput="state.groupForm.max=this.value"></div><div><label class="muted">Pincode (optional)</label><input id="cg-pin" class="input" inputmode="numeric" maxlength="6" value="${escapeHtml(gf.pincode)}" oninput="state.groupForm.pincode=this.value"></div><div class="full"><label class="muted">Delivery note (optional)</label><input id="cg-info" class="input" maxlength="300" value="${escapeHtml(gf.info)}" oninput="state.groupForm.info=this.value"></div></div><div id="cg-error" class="auth-error" role="alert"></div><button class="btn primary block" style="margin-top:14px" onclick="createCommunityUI()" ${state.creatingGroup?'disabled':''}>${state.creatingGroup?en.creatingGroup:'Create group'}</button></div>`;
  const filterChips=`<div class="chips" style="margin:12px 0 4px">${['All','Open','Joined'].map((f)=>`<button class="chip ${state.groupFilter===f?'active':''}" onclick="state.groupFilter='${f}';render()">${f}</button>`).join('')}</div>`;
  return `<div class="screen">${header('Bulk groups','Communities near you')}<div class="container"><div class="forecast-banner"><div style="font-weight:900;color:#7b651f">◉ Pool demand. Pay less.</div><div class="desc">Orders aggregate when the target quantity is reached. Delivery and cash on delivery are arranged per group.</div></div>${filterChips}<details class="card" style="padding:12px 16px;margin-top:12px"><summary style="font-weight:900;cursor:pointer">How bulk groups work</summary><ol class="muted" style="font-size:13px;margin:8px 0 4px;padding-left:20px"><li>Farmers publish bulk offers, or any consumer can start a community group.</li><li>Consumers join with a quantity and a saved map delivery address.</li><li>Progress tracks pooled quantity against the target in real time.</li><li>When the target is reached, the assigned farmer confirms fulfilment.</li><li>Each participant gets an individual delivery order, payable cash on delivery.</li></ol></details><div class="stack" style="margin-top:14px">${visible.length?visible.map((g)=>{const pct=Math.min(100,Math.round(g.collectedQuantity/g.targetQuantity*100));const joined=mine(g.groupId);return `<article class="card group-card"><div class="group-row"><div><div class="group-title">${escapeHtml(g.productName)}</div><div class="group-sub">${escapeHtml(g.assignedFarmerName||(g.model==='offer'?g.farmerName:''))||'Awaiting farmer'}${g.priceAtOffer!=null?` · ${money(g.priceAtOffer)}/kg`:''}</div></div><span class="badge ${g.status==='OPEN'?'':'blue'}">${escapeHtml(g.status)}</span></div><div style="font-size:13px;font-weight:900;margin-top:14px">${g.collectedQuantity}/${g.targetQuantity} kg pooled · ${g.participantCount} participants</div><div class="progress"><span style="width:${pct}%"></span></div>${g.pickupNote?`<div class="muted" style="font-size:12px;margin-top:8px">${escapeHtml(g.pickupNote)}</div>`:''}<div class="muted" style="font-size:12px;margin-top:4px">Min ${g.minPerParticipant}kg${g.maxPerParticipant?` · max ${g.maxPerParticipant}kg`:''} per person</div><div class="muted" style="font-size:12px;margin-top:4px">Delivery · cash on delivery</div>${g.deliveryInfo?`<div class="muted" style="font-size:12px;margin-top:4px">${escapeHtml(g.deliveryInfo)}</div>`:''}${g.assignedFarmerName?`<div class="muted" style="font-size:12px;margin-top:4px">Supplied by ${escapeHtml(g.assignedFarmerName)}</div>`:`<div class="muted" style="font-size:12px;margin-top:4px">Awaiting farmer</div>`}${g.assignmentHistory?.length?`<div class="muted" style="font-size:12px;margin-top:4px">Assignment history: ${g.assignmentHistory.length}</div>`:''}<div class="row" style="margin-top:14px">${g.status==='OPEN'?(joined?`<span class="badge blue">Joined</span><button class="btn secondary" onclick="leaveBulkGroupUI('${g.groupId}')">Leave group</button>`:`<div><div style="display:flex;gap:8px;align-items:center"><input id="join-${g.groupId}" class="input" type="number" min="${g.minPerParticipant}" step="0.5" value="${g.minPerParticipant}" style="width:110px"><button class="btn primary" onclick="joinBulkGroupUI('${g.groupId}')">Join</button></div>${state.addresses.length?`<select id="join-which-${g.groupId}" class="input" style="margin-top:8px" onchange="state.bulkJoinAddr['${g.groupId}']=this.value">${state.addresses.map((a)=>`<option value="${a.id}"${bulkJoinAddressId(g.groupId)===a.id?' selected':''}>${escapeHtml(a.label)} · ${escapeHtml(addressText(a))}</option>`).join('')}</select><button class="btn secondary" style="margin-top:8px" onclick="openAddressPicker('bulkJoin','','${g.groupId}')">New address on map</button>`:`<button class="btn secondary" style="margin-top:8px" onclick="openAddressPicker('bulkJoin','','${g.groupId}')">Add delivery address on map</button>`}</div>`):`<span class="badge blue">${escapeHtml(g.status)}</span>`}</div></article>`}).join(''):'<div class="card" style="padding:18px">No bulk groups yet. Farmers publish bulk offers here. Check back soon.</div>'}</div>${groupForm}</div>${consumerNav()}</div>`;
};
forecast=()=>{
  const data=state.forecast;
  const body=!data?'<div class="card" style="padding:18px">Loading…</div>':data.insufficientData?'<div class="card" style="padding:18px"><h3>No forecast yet</h3><p class="muted">Not enough sales data yet. Predictions appear after your first orders.</p></div>':`<p class="muted">Rule-based · your last 30 days of sales</p><div class="stack" style="margin-top:12px">${data.products.map((p)=>`<div class="card" style="padding:16px"><div class="row"><b>${escapeHtml(p.productName)}</b><span class="badge">Suggested restock: ${p.suggestedRestock} kg</span></div><div class="grid2" style="margin-top:12px;font-size:12px"><div><div class="muted">SOLD (30 DAYS)</div><b>${p.soldLast30Days} kg · ${p.orderCount} orders</b></div><div><div class="muted">AVG WEEKLY</div><b>${p.avgWeeklySales} kg</b></div></div><div class="muted" style="font-size:12px;margin-top:8px">In stock now: ${p.activeInventory} kg</div></div>`).join('')}</div>`;
  return `<div class="screen">${header('Demand forecast',state.user?.pincode||'')}<div class="container">${body}</div>${farmerNav()}</div>`;
};
profile=()=>{
 const user=state.user||{};
 const name=escapeHtml(user.name||'');
 const phone=escapeHtml(user.phone||'Not provided');
 const location=escapeHtml([user.location,user.pincode].filter(Boolean).join(' · ')||'Not provided');
 const initials=escapeHtml((user.name||'').split(/\s+/).map((part)=>part[0]||'').join('').slice(0,2).toUpperCase());
  return `<div class="screen">${header('Profile',user.role==='FARMER'?'Farmer account':'Consumer account')}<div class="container"><div class="card" style="padding:18px;background:var(--green);color:#fff"><div class="row"><div><div style="font-size:21px;font-weight:950">${name}</div><div style="margin-top:3px;opacity:.9">${phone}</div><div style="margin-top:6px">${location}</div></div><div style="width:64px;height:64px;border-radius:50%;background:#fff3c9;color:var(--green);display:grid;place-items:center;font-weight:950;font-size:20px">${initials}</div></div></div><div class="card" style="padding:16px;margin-top:14px">${state.profileEditing?`<h3 style="margin:0 0 12px">Edit profile</h3><div class="form-grid"><div class="full"><label class="muted">Full name</label><input id="p-name" class="input" maxlength="100" value="${escapeHtml(user.name||'')}"></div><div><label class="muted">Phone</label><input id="p-phone" class="input" type="tel" maxlength="32" value="${escapeHtml(user.phone||'')}"></div><div><label class="muted">Pincode</label><input id="p-pincode" class="input" inputmode="numeric" maxlength="6" value="${escapeHtml(user.pincode||'')}"></div><div class="full"><label class="muted">${user.role==='FARMER'?'Farm name':'Delivery location'}</label><input id="p-extra" class="input" maxlength="160" value="${escapeHtml(user.role==='FARMER'?(user.farmName||''):user.location||'')}"></div></div><div id="profile-error" class="auth-error" role="alert"></div><div class="row" style="margin-top:14px"><button class="btn primary" style="flex:1" onclick="updateProfileUI()" ${state.savingProfile?'disabled':''}>${state.savingProfile?en.saving:en.saveChanges}</button><button class="btn secondary" onclick="updateProfileEditMode(false)">Cancel</button></div></div>`:`<div class="row"><h3 style="margin:0">My details</h3><button class="btn secondary" onclick="updateProfileEditMode(true)">✎ Edit profile</button></div><div style="margin-top:12px"><div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="muted">Full name</span><b>${name||'—'}</b></div><div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="muted">Phone</span><b>${phone}</b></div><div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="muted">Pincode</span><b>${escapeHtml(user.pincode||'—')}</b></div><div class="row" style="padding:8px 0"><span class="muted">${user.role==='FARMER'?'Farm name':'Delivery location'}</span><b>${escapeHtml(user.role==='FARMER'?(user.farmName||'—'):user.location||'—')}</b></div></div>`}</div>${state.role === 'consumer' ? addressBookCard() : farmLocationCard()}<div class="card" style="padding:15px;margin-top:14px"><b>App language</b><div class="chips" style="margin-top:10px"><button class="chip ${state.language==='en'?'active':''}" data-language="en">${en.english}</button><button class="chip ${state.language==='te'?'active':''}" data-language="te">${te.telugu}</button></div></div><button class="btn secondary block" style="margin-top:14px" onclick="logout()">Sign out</button><button class="btn danger block" style="margin-top:10px" onclick="deleteAccountUI()">Delete account</button></div>${state.role==='farmer'?farmerNav():consumerNav()}</div>`;
};
payment=()=>{
 const items=cartItems();
 const subtotal=Math.round(items.reduce((sum,item)=>sum+item.p.price*item.qty,0)*100)/100;
 const fee=Math.round(subtotal*state.feePercent)/100;
 const total=Math.round((subtotal+fee)*100)/100;
 const selected=state.addresses.find((a)=>a.id===state.selectedAddressId);
 return `<div class="screen">${header('Checkout','Payment is simulated',true)}<div class="container"><div class="card" style="padding:14px"><h2>Delivery address</h2>${state.addresses.length?`<div class="stack">${state.addresses.map((a)=>`<label class="addr-row"><input type="radio" name="checkout-addr" ${a.id===state.selectedAddressId?'checked':''} onchange="state.selectedAddressId='${a.id}';render()"><div><b>${escapeHtml(a.label)}</b><div class="muted" style="font-size:12px">${escapeHtml(addressText(a))}</div></div></label>`).join('')}</div>`:'<p class="muted">No saved addresses yet.</p>'}<button class="btn secondary block" style="margin-top:12px" onclick="openAddressPicker('checkout')">Add new address on map</button>${selected?`<div class="muted" style="font-size:12px;margin-top:8px">Delivering to: ${escapeHtml(addressText(selected))}</div>`:''}</div><h3>Items</h3><div class="stack">${items.map((item)=>`<div class="row"><span>${item.p.name} · ${item.qty} kg</span><b>${money(item.p.price*item.qty)}</b></div>`).join('')}</div><div class="card" style="padding:14px;margin-top:14px"><div class="row"><b>Subtotal</b><b>${money(subtotal)}</b></div><div class="summary-line"><span>Delivery fee (${state.feePercent}%)</span><b>${money(fee)}</b></div><div class="summary-line total"><span>Total payable</span><b style="color:var(--green)">${money(total)}</b></div><p class="muted">Farmiqo delivery fee · final total is confirmed by the server when you place the order.</p></div><h3 style="margin:18px 0 12px">Choose payment method</h3><div class="grid2"><button class="btn ${state.payMethod==='UPI'?'primary':'secondary'}" onclick="state.payMethod='UPI';render()">UPI (simulation)</button><button class="btn ${state.payMethod==='POD'?'primary':'secondary'}" onclick="state.payMethod='POD';render()">Cash on delivery</button></div><p class="muted">UPI does not charge or transfer money. No payment provider is connected.</p><button class="btn primary block" style="margin-top:16px" onclick="payNow()">Place order · ${money(total)}</button></div></div>`;
};
joinGroup=()=>toast('Bulk groups are not available yet.');
async function joinBulkGroupUI(groupId){const qty=Number(document.getElementById(`join-${CSS.escape(groupId)}`)?.value);if(!Number.isFinite(qty)||qty<=0){toast('Enter a quantity in kg');return}const which=document.getElementById(`join-which-${CSS.escape(groupId)}`);const addressId=which?which.value:(state.bulkJoinAddr?.[groupId]||'');if(!addressId){toast('Choose a delivery address or add one on the map');return}try{await joinBulkGroup(groupId,qty,undefined,undefined,addressId);toast('Joined group');await refreshBulkGroups()}catch(error){toast(error.message)}}
async function leaveBulkGroupUI(groupId){try{await leaveBulkGroup(groupId);toast('You left the group');await refreshBulkGroups()}catch(error){toast(error.message)}}
async function createBulkOfferUI(){const f=state.offerForm;const listingId=f.listingId||state.listings.find((item)=>item.status==='ACTIVE')?.id;if(!listingId){toast('Create a produce listing first');return}try{await createBulkGroup({listingId,targetQuantity:Number(f.target),minPerParticipant:f.min===''?undefined:Number(f.min),maxPerParticipant:f.max===''?undefined:Number(f.max),slotDate:f.slot||undefined,pickupNote:f.note});state.offerForm={listingId:'',target:'',min:'',max:'',note:'',slot:''};toast('Bulk offer published');await refreshFarmerOffers();render()}catch(error){toast(error.message)}}
async function cancelBulkGroupUI(groupId){if(!confirm('Cancel this bulk offer?'))return;try{await cancelBulkGroup(groupId);toast('Bulk offer cancelled');await refreshFarmerOffers()}catch(error){toast(error.message)}}
async function fulfilBulkGroupUI(groupId){if(!confirm('Create delivery orders for all participants?'))return;try{const result=await fulfilBulkGroup(groupId);toast(`Delivery orders created: ${result.orders.length}`);await refreshFarmerOffers();await refreshFarmerData()}catch(error){toast(error.message)}}
async function submitForgot(event){event.preventDefault();const email=document.getElementById('forgot-email').value.trim();try{await requestPasswordReset(email);state.screen='auth';state.authMode='login';toast('If an account exists for that email, a reset link was sent.');render()}catch(error){const target=document.getElementById('forgot-error');if(target)target.textContent=error.message}}
async function submitReset(event){event.preventDefault();const password=document.getElementById('reset-password').value;try{await confirmPasswordReset(state.resetToken,password);state.resetToken=null;state.screen='auth';state.authMode='login';toast('Password updated. Please sign in.');render()}catch(error){const target=document.getElementById('reset-error');if(target)target.textContent=error.message}}
async function deleteAccountUI(){const password=prompt('Type your password to permanently delete your account.');if(password===null)return;try{await deleteAccountRequest(password);toast('Account deleted');logout()}catch(error){toast(error.message)}}
function updateProfileEditMode(on){state.profileEditing=!!on;if(!on)state.savingProfile=false;render()}
async function updateProfileUI(){if(state.savingProfile)return;const nameEl=document.getElementById('p-name'),phoneEl=document.getElementById('p-phone'),pinEl=document.getElementById('p-pincode'),extraEl=document.getElementById('p-extra');if(!nameEl||!phoneEl||!pinEl||!extraEl)return;const values={name:nameEl.value.trim(),phone:phoneEl.value.trim(),pincode:pinEl.value.trim()};const extra=extraEl.value.trim();if(!values.name){toast('Name is required.');return}if(state.user?.role==='FARMER')values.farmName=extra;else values.location=extra;state.savingProfile=true;render();try{const user=await updateProfile(values);state.user=user;localStorage.setItem('farmiqo-user',JSON.stringify(user));state.profileEditing=false;toast('Profile updated')}catch(error){const target=document.getElementById('profile-error');if(target)target.textContent=error.message;else toast(error.message)}finally{state.savingProfile=false;render()}}
async function uploadPhotoUI(input){const file=input.files?.[0];if(!file)return;if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>5*1024*1024){toast('Use a JPEG, PNG, or WebP photo under 5 MB');input.value='';return}try{toast('Uploading photo…');const config=await getUploadConfig();const sig=await getUploadSignature();const form=new FormData();form.append('file',file);form.append('api_key',sig.apiKey);form.append('timestamp',sig.timestamp);form.append('folder',sig.folder);form.append('signature',sig.signature);const res=await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,{method:'POST',body:form});const data=await res.json();if(!res.ok||!data.secure_url)throw new Error('Photo upload failed');state.uploadUrl=data.secure_url;state.uploadSource='photo';toast('Photo uploaded');render()}catch(error){state.uploadUrl='';state.uploadSource='';input.value='';toast(error.message)}}
function forgotScreen(){return `<div class="screen role-screen"><div class="hero-logo"><img class="brand-symbol" src="/icon.svg" alt=""><div class="brand-copy"><div class="word">Farmiqo</div><div class="tag">Farmer to Consumer</div></div></div><div class="card auth-card"><h1>Reset password</h1><form onsubmit="submitForgot(event)"><label class="auth-field">Email<input id="forgot-email" class="input" type="email" autocomplete="email" required></label><div id="forgot-error" class="auth-error" role="alert"></div><button class="btn primary block" type="submit">Send reset link</button></form><button class="auth-back" type="button" onclick="state.screen='auth';render()">Back to sign in</button></div></div>`}
function resetScreen(){return `<div class="screen role-screen"><div class="hero-logo"><img class="brand-symbol" src="/icon.svg" alt=""><div class="brand-copy"><div class="word">Farmiqo</div><div class="tag">Farmer to Consumer</div></div></div><div class="card auth-card"><h1>Set a new password</h1><form onsubmit="submitReset(event)"><label class="auth-field">New password (8+ characters)<input id="reset-password" class="input" type="password" minlength="8" autocomplete="new-password" required></label><div id="reset-error" class="auth-error" role="alert"></div><button class="btn primary block" type="submit">Update password</button></form><button class="auth-back" type="button" onclick="state.screen='auth';render()">Back to sign in</button></div></div>`}
payNow=async()=>{
 if(!cartItems().length){toast('Your cart is empty');return}
 if(!state.selectedAddressId){toast('Choose a delivery address');return}
 try{
  const order=await createOrder({paymentMethod:state.payMethod==='POD'?'COD':'UPI_MOCK',fulfillment:'DELIVERY',addressId:state.selectedAddressId});
  state.cart={};
  state.orders.unshift({id:order.orderId,status:order.status,items:order.items.map((item)=>`${escapeHtml(item.productName)} ${item.quantity}kg · ${escapeHtml(item.farmerName)}`).join(' · '),amount:order.total,paymentMethod:order.paymentMethod,paymentStatus:order.paymentStatus,raw:order});
  state.screen='orders';
  toast(order.paymentMethod==='COD'?'COD order placed':'Order placed; simulated UPI is not charged');
  await refreshMarketplace();
  render();
 }catch(error){toast(error.message)}
};
productDetail=(product)=>{
 const minimum=Math.max(1,Number(product.minOrderQuantity)||1);
 return `<div class="screen">${header(product.name,product.harvest,true)}<img src="${ASSET+product.img}" style="width:100%;height:315px;object-fit:cover"><div class="container"><div class="row"><div><h1 style="margin:4px 0 6px;font-size:26px">${product.name}</h1><div class="muted">${product.grade?`Grade ${escapeHtml(product.grade)}`:''} ${product.farmingMethod?`· ${escapeHtml(product.farmingMethod)}`:''}</div></div><div style="text-align:right"><div class="price" style="font-size:24px">${money(product.price)}</div><div class="muted" style="font-size:12px">per ${escapeHtml(product.priceUnit||'kg')}</div></div></div><div class="card" style="padding:14px;margin-top:16px"><div class="row"><div><b>${product.farmer}</b><div class="muted" style="font-size:12px">${product.distance}</div></div><div>${sourceBadge(product)}</div></div>${product.description?`<p>${product.description}</p>`:''}</div><div class="row" style="margin-top:16px"><div><b>Available stock</b><div class="muted" style="font-size:12px">${product.qty} ${escapeHtml(product.priceUnit||'kg')}</div></div><button class="btn primary" onclick="addToCart('${product.id}',${minimum})">Add ${minimum} to cart</button></div></div>${consumerNav()}</div>`;
};
refreshFarmerData=async()=>{
 if(state.role!=='farmer')return;
 try{
  const [listings,orders]=await Promise.all([getFarmerListings(),getFarmerOrders()]);
  state.listings=listings.map(normalizeListing);
  state.orders=orders.map(({order,subOrder})=>({
   id:order.orderId,
   status:subOrder.status,
   rawStatus:subOrder.status,
   addressText:[order.address, order.pincode].filter(Boolean).join(' · '),
   deliveryLat:Number.isFinite(Number(order.deliveryLat))?Number(order.deliveryLat):null,
   deliveryLng:Number.isFinite(Number(order.deliveryLng))?Number(order.deliveryLng):null,
   hasCoords:Number.isFinite(Number(order.deliveryLat))&&Number.isFinite(Number(order.deliveryLng)),
   items:subOrder.itemIndexes.map((index)=>{const item=order.items[index];return item?`${escapeHtml(item.productName)} ${item.quantity}kg`:''}).filter(Boolean).join(' · '),
   amount:subOrder.itemIndexes.reduce((sum,index)=>sum+(order.items[index]?.subtotal||0),0),
   consumer:escapeHtml(order.consumerName||'Consumer'),
   paymentMethod:order.paymentMethod,
   paymentStatus:order.paymentStatus,
   subOrderId:subOrder.subOrderId,
   itemIndexes:Array.isArray(subOrder.itemIndexes)?subOrder.itemIndexes.filter((index)=>Number.isInteger(index)&&order.items[index]):[],
   raw:order,
  }));
  if(['farmerHome','listings','orders'].includes(state.screen))render();
 }catch(error){
  if(error.status===401){clearSession();state.role=null;state.user=null;state.screen='role';render()}
  else toast(error.message);
 }
};
refreshOrders=async()=>{
 if(state.role==='farmer'){await refreshFarmerData();return}
 if(state.role!=='consumer')return;
 try{
  state.orders=(await getOrders()).map((order)=>({
   id:order.orderId,
   status:({ORDER_PLACED:'Open',FARMER_ACCEPTED:'Accepted',PREPARING:'Preparing',READY_FOR_PICKUP:'Ready for pickup',OUT_FOR_DELIVERY:'Out for delivery',DELIVERED:'Delivered',COMPLETED:'Completed',FARMER_REJECTED:'Rejected',CANCELLED:'Cancelled',IN_PROGRESS:'In progress'})[order.status]||order.status,
   rawStatus:order.status,
   items:order.items.map((item)=>`${escapeHtml(item.productName)} ${item.quantity}kg · ${escapeHtml(item.farmerName)}`).join(' · '),
   amount:order.total,
   paymentMethod:order.paymentMethod,
   paymentStatus:order.paymentStatus,
  }));
  if(state.screen==='orders')render();
 }catch(error){
  if(error.status===401){clearSession();state.role=null;state.user=null;state.screen='role';render()}
  else toast(error.message);
 }
};
orders=()=>state.role==='farmer'
 ? `<div class="screen">${header('Orders received','Orders assigned to your farm')}<div class="container"><div class="section-title">Incoming orders</div><div class="stack" style="margin-top:14px">${state.orders.length?state.orders.map((order)=>`<article class="card group-card"><div class="group-row"><div><div class="group-title">#${escapeHtml(order.id)}</div><div class="group-sub">${order.consumer} · ${escapeHtml(order.rawStatus.replaceAll('_',' '))}</div></div><span class="badge">${order.paymentMethod==='COD'?`COD · ${escapeHtml(order.paymentStatus)}`:'UPI · simulated'}</span></div><div class="order-meta" style="margin-top:12px">${order.items}</div><div class="muted" style="font-size:12px;margin-top:8px">${order.addressText||''}</div>${order.hasCoords?`<div style="margin-top:10px"><div class="row"><button class="btn secondary" onclick="toggleOrderMap('${order.id}',${order.deliveryLat},${order.deliveryLng})">View map</button><a class="btn primary" href="${directionsUrl(order.deliveryLat,order.deliveryLng)}" target="_blank" rel="noopener">Get Directions</a></div><div id="ordermap-${order.id}" class="map-box small" style="display:none;margin-top:10px"></div></div>`:''}<div class="row" style="margin-top:14px"><strong class="price">${money(order.amount)}</strong><div style="display:flex;gap:8px;align-items:center"><button class="btn secondary small" onclick="openOrderDetail('${order.id}')">View Details</button><div class="inline-order-actions">${farmerOrderActions(order)}</div></div></div></article>`).join(''):'<div class="empty"><h3>No orders yet</h3><p>Consumer orders will appear here.</p></div>'}</div></div>${farmerNav()}</div>`
 : `<div class="screen">${header('Orders','Track your farm orders')}<div class="container">${state.orders.length?`<div class="stack">${state.orders.map((order)=>`<article class="card" style="padding:16px"><div class="row"><div><b>#${escapeHtml(order.id)}</b></div><span class="badge">${escapeHtml(order.status)}</span></div><div class="muted" style="font-size:13px;margin-top:14px">${order.items}</div><div class="row" style="margin-top:14px"><span>${order.paymentMethod==='UPI_MOCK'?'UPI (simulated)':'Cash on delivery'} · ${escapeHtml(order.paymentStatus)}</span><b>${money(order.amount)}</b></div><div class="row" style="margin-top:10px"><button class="btn secondary" onclick="openOrderDetail('${order.id}')">View Details</button></div></article>`).join('')}</div>`:'<div class="card" style="padding:18px">No orders yet. Orders you place will appear here.</div>'}</div>${consumerNav()}</div>`;
const originalRender=render;
render=()=>{
 originalRender();
 document.querySelectorAll('#app img').forEach((image)=>{
  const src=image.getAttribute('src')||'';
  if(src.startsWith('/assets/https://')||src.startsWith('/assets/http://'))image.setAttribute('src',src.slice('/assets/'.length));
  else if(src==='/assets/icon.svg')image.setAttribute('src','/icon.svg');
 });
};
async function restoreSession(){
 try{
  const user=await getCurrentUser();
  if(!['FARMER','CONSUMER'].includes(user.role))throw new Error('The account role is invalid.');
  state.user=user;
  state.role=user.role.toLowerCase();
  state.screen=state.role==='farmer'?'farmerHome':'consumerHome';
  localStorage.setItem('farmiqo-user',JSON.stringify(user));
  connectRealtime(handleRealtimeEvent);
  render();
  await refreshFeeConfig();
  await (state.role==='farmer'?refreshFarmerData():refreshMarketplace());
  await refreshAddresses();
 }catch(error){
  if(error.status===401){
   clearSession();
   state.user=null;
   state.role=null;
   state.screen='role';
   render();
  }else toast(error.message);
 }
}
Object.assign(window,{state,render,setScreen,setRole,submitAuth,submitForgot,submitReset,toggleAuthMode,setLanguage,goBack,openProfile,openAddProduce,closeModal,addListing,editListing,deleteListing,deleteAccountUI,updateProfileUI,adjustTomato,addToCart,changeQty,removeFromCart,joinGroup,joinBulkGroupUI,leaveBulkGroupUI,createBulkOfferUI,createCommunityUI,assignBulkGroupUI,unassignBulkGroupUI,cancelBulkGroupUI,fulfilBulkGroupUI,uploadPhotoUI,payNow,reorder,switchRole,logout,openAddressPicker,saveAddressUI,editAddressUI,removeAddressUI,pickerSearch,useMyLocation,confirmPin,toggleOrderMap,directionsUrl,openOrderDetail,closeOrderDetail,updateProfileEditMode});
render();
checkResetHash();
void refreshFeeConfig();
if(isAuthenticated())void restoreSession();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(error=>console.warn('Service worker registration failed',error)));
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;render()});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;toast(en.installed);render()});
