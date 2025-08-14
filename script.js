/* ------------- Debt‑vs‑DCA Simulator ------------- */
/* Using CoinPaprika free API - CORS enabled, no rate limits */

let topTokens = [];
let selectedToken = { id: "", symbol: "" };
let sigmaDynamic = 0.10; // updated dynamically
let avgDailyReturn = 0; // Historical average daily return

const tokenSearch = document.getElementById("tokenSearch");
const tokenList   = document.getElementById("tokenList");
let currentPeriod = "90"; // Default to 3 months

// Helper function for CoinGecko API calls via proxy with localStorage caching
async function fetchCryptoData(endpoint) {
  // Check localStorage cache first
  const cacheKey = `crypto_${endpoint}`;
  const cachedData = localStorage.getItem(cacheKey);
  
  if (cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      const cacheAge = Date.now() - parsed.timestamp;
      const maxAge = endpoint.includes('market_chart') ? 10 * 60 * 1000 : 5 * 60 * 1000; // Historical: 10min, Others: 5min
      
      if (cacheAge < maxAge) {
        console.log('Using cached data for:', endpoint);
        return parsed.data;
      } else {
        localStorage.removeItem(cacheKey);
      }
    } catch (e) {
      localStorage.removeItem(cacheKey);
    }
  }
  
  // Use local proxy for development, your domain for production
  const proxyUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? '/api/proxy' 
    : '/api/proxy';
    
  try {
    const response = await fetch(`${proxyUrl}?endpoint=${encodeURIComponent(endpoint)}`);
    if (!response.ok) {
      if (response.status === 429) {
        const data = await response.json();
        throw new Error(`Rate limit exceeded: ${data.error}`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Cache the response in localStorage
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
      console.log('Cached data to localStorage for:', endpoint);
    } catch (e) {
      console.warn('Failed to cache to localStorage:', e);
    }
    
    return data;
  } catch (error) {
    console.error('CoinGecko API error:', error);
    throw error;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  fetchTopTokens();
  setupPeriodButtons();
});

tokenSearch.addEventListener("input", filterTokens);

function setupPeriodButtons() {
  const buttons = document.querySelectorAll(".period-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", function() {
      buttons.forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      currentPeriod = this.dataset.period;
      if (selectedToken.id) {
        fetchHistoricalData(selectedToken.id);
      }
    });
  });
}

function copy(buttonEl) {
    const id = buttonEl.getAttribute("data-copy-id");
    const text = document.getElementById(id).textContent.trim();
    navigator.clipboard.writeText(text);
  
    const tooltip = document.createElement("div");
    tooltip.className = "copy-tooltip";
    tooltip.innerText = "Copied!";
  
    const rect = buttonEl.getBoundingClientRect();
    tooltip.style.left = rect.left + window.scrollX + "px";
    tooltip.style.top = rect.top + window.scrollY - 30 + "px";
  
    document.body.appendChild(tooltip);
    requestAnimationFrame(() => {
      tooltip.style.opacity = 1;
      tooltip.style.transform = "translateY(-12px)";
    });
  
    setTimeout(() => {
      tooltip.style.opacity = 0;
      tooltip.style.transform = "translateY(-16px)";
      setTimeout(() => tooltip.remove(), 400);
    }, 1000);
}

// Fetch top tokens from CoinGecko - efficient to stay under 30 req/min
async function fetchTopTokens() {
  try {
    // Get top 20 coins by market cap - 1 API call
    const data = await fetchCryptoData('coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C30d');
    console.log('CoinGecko API response:', data);
    
    if (Array.isArray(data)) {
      topTokens = data.map(crypto => ({
        id: crypto.id,
        symbol: crypto.symbol.toUpperCase(),
        name: crypto.name,
        price: crypto.current_price
      }));
      console.log('Processed tokens:', topTokens);
      renderTokenList("");
      return;
    }
    
    throw new Error('Invalid API response format');
    
  } catch (err) {
    console.error("Failed to load top tokens", err);
    // Fallback to common tokens
    topTokens = [
      { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
      { id: "ethereum", symbol: "ETH", name: "Ethereum" },
      { id: "tether", symbol: "USDT", name: "Tether" },
      { id: "binancecoin", symbol: "BNB", name: "BNB" },
      { id: "solana", symbol: "SOL", name: "Solana" },
      { id: "cardano", symbol: "ADA", name: "Cardano" },
      { id: "ripple", symbol: "XRP", name: "Ripple" },
      { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
      { id: "avalanche-2", symbol: "AVAX", name: "Avalanche" },
      { id: "polkadot", symbol: "DOT", name: "Polkadot" }
    ];
    renderTokenList("");
  }
}

function renderTokenList(filter) {
  tokenList.innerHTML = "";
  topTokens
    .filter(t => t.symbol.includes(filter.toUpperCase()) || t.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach(t => {
      const li = document.createElement("li");
      li.textContent = `${t.symbol} (${t.name})`;
      li.onclick = () => selectToken(t.id, t.symbol);
      tokenList.appendChild(li);
    });
}

function filterTokens() {
  const q = tokenSearch.value.trim();
  renderTokenList(q);
  if (q.length >= 2) lookupToken(q);
}

function selectToken(id, symbol) {
  setSelectedToken(id, symbol);
  fetchPriceAndData(id);
}

async function lookupToken(q) {
  try {
    // Search using CoinGecko - 1 API call
    const data = await fetchCryptoData(`search?query=${encodeURIComponent(q)}`);
    
    if (data && data.coins && data.coins.length > 0) {
      const coin = data.coins[0];
      setSelectedToken(coin.id, coin.symbol.toUpperCase());
      fetchPriceAndData(coin.id);
    }
  } catch (err) {
    console.warn("Token lookup failed", err);
  }
}

function setSelectedToken(id, symbol) {
  selectedToken = { id, symbol };
  if (symbol) tokenSearch.value = `${symbol} (${id})`;
  fetchHistoricalData(id);
}

function setStartPrice(v) {
  document.getElementById("startPrice").value = v;
}

async function fetchPriceAndData(id) {
  try {
    // Get current price from CoinGecko - 1 API call
    const data = await fetchCryptoData(`simple/price?ids=${id}&vs_currencies=usd`);
    if (data && data[id] && data[id].usd) {
      setStartPrice(parseFloat(data[id].usd));
    }
  } catch (err) {
    console.error("Failed to fetch price", err);
  }
}

// Fetch historical data from CoinGecko to calculate average returns
async function fetchHistoricalData(id) {
  try {
    const days = currentPeriod === "max" ? 365 : parseInt(currentPeriod);
    
    // Get historical market chart data from CoinGecko - 1 API call
    const data = await fetchCryptoData(`coins/${id}/market_chart?vs_currency=usd&days=${days}`);
    console.log('Historical data response:', data);
    
    if (data && data.prices && Array.isArray(data.prices) && data.prices.length >= 2) {
      // Extract prices from [timestamp, price] arrays
      const prices = data.prices.map(pricePoint => pricePoint[1]);
      console.log('Extracted prices:', prices.length, 'data points');
      
      // Calculate average daily return from historical prices
      processHistoricalData(prices);
      return;
    }
    
    console.warn('CoinGecko historical data insufficient, using fallback');
    // Ultimate fallback
    avgDailyReturn = 0.002; // 0.2% daily
    sigmaDynamic = 0.05;
    updateHistoricalStats();
    
  } catch (err) {
    console.error("Historical data fetch failed", err);
    // Ultimate fallback
    avgDailyReturn = 0.002;
    sigmaDynamic = 0.05;
    updateHistoricalStats();
  }
}


// Process historical price data to calculate returns
function processHistoricalData(prices) {
  if (prices.length < 2) {
    console.error("Insufficient price data");
    return;
  }
  
  // Calculate returns
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const dailyReturn = (prices[i] - prices[i-1]) / prices[i-1];
    returns.push(dailyReturn);
  }
  
  // Calculate average daily return
  avgDailyReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  
  // Calculate volatility (standard deviation)
  const mean = avgDailyReturn;
  const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
  sigmaDynamic = Math.sqrt(variance);
  
  // Update UI
  updateHistoricalStats();
}


function updateHistoricalStats() {
  const avgReturnPercent = (avgDailyReturn * 100).toFixed(4);
  const annualizedReturn = ((Math.pow(1 + avgDailyReturn, 365) - 1) * 100).toFixed(2);
  
  document.getElementById("avgReturn").textContent = avgReturnPercent;
  document.getElementById("projectedAnnual").textContent = annualizedReturn;
  document.getElementById("historicalStats").style.display = "block";
  
  console.log(`Avg Daily Return: ${avgReturnPercent}%, Projected Annual: ${annualizedReturn}%`);
}

function showDropdown() { tokenList.style.display = "block"; }
function hideDropdown() { setTimeout(() => tokenList.style.display = "none", 150); }

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function runSimulation() {
    const debt        = +document.getElementById("debtAmount").value;
    const apr         = +document.getElementById("apr").value;
    const pay         = +document.getElementById("monthlyPayment").value;
    const p0          = +document.getElementById("startPrice").value;
  
    if (![debt, apr, pay, p0].every(Number.isFinite))
      return alert("Fill all required fields");
  
    // Scenario: IGNORE debt payments entirely and DCA into crypto instead
    const monthlyRate = apr/12/100;
    const SYM = selectedToken.symbol || "TOKENS";
    
    // Fixed simulation period (user can choose how long to project)
    const maxMonths = 48; // 4 years default - user can adjust this
    
    // Convert daily return to monthly compound return
    const monthlyGrowthRate = Math.pow(1 + avgDailyReturn, 30) - 1;
  
    let remainingDebt = debt;
    let totalInterest = 0;
    let totalTokens = 0;
    const debtData = [], dcaData = [], pricePath = [];
  
    for (let i = 0; i < maxMonths; i++) {
      // Debt compounds monthly with NO PAYMENTS (ignored entirely)
      remainingDebt *= (1 + monthlyRate);
      totalInterest = remainingDebt - debt; // Total interest accrued
      debtData.push(remainingDebt);
  
      // Crypto price grows based on historical returns
      let price = p0 * Math.pow(1 + monthlyGrowthRate, i);
      pricePath.push(price);
  
      // DCA the monthly payment amount into crypto instead of paying debt
      totalTokens += pay / price;
      dcaData.push(totalTokens * price);
    }
  
    const months     = debtData.length;
    const finalValue = dcaData.at(-1);
    const crossover  = dcaData.findIndex((v,i)=>v >= debtData[i]) + 1 || null;
    const tokensNow  = totalTokens;
    const avgBuyPrice = pay * months / tokensNow;
    const tokensFromInterest = totalInterest / p0;
    const profitIfSold = finalValue - remainingDebt;
  
    let extraInsight = "";
    if (!crossover) {
      const reqPrice = remainingDebt / tokensNow;
      const priceFinal = pricePath[pricePath.length-1];
      const sumInv = pricePath.reduce((sum, pr) => sum + (1/pr), 0);
      const reqPay = remainingDebt / (priceFinal * sumInv);
  
      extraInsight = `
        <li>To cover all debt, ${SYM} must hit ~$${reqPrice.toFixed(2)} by month ${months}.</li>
        <li>Or DCA at least $${reqPay.toFixed(2)}/mo for this to break even.</li>
      `;
    }
    
    const projectedFinalPrice = pricePath[pricePath.length-1];
    const periodLabels = {"30": "1 Month", "90": "3 Months", "365": "1 Year", "max": "All Time"};
    const periodLabel = periodLabels[currentPeriod];
  
    document.getElementById("results").innerHTML = `
      <h2>Results: Ignore Debt vs Stack Crypto</h2>
      <div class="summary-block">
        <p><b>Debt (ignored):</b> Balloons to $${remainingDebt.toFixed(2)} after ${months} months (${(((remainingDebt/debt - 1) * 100)).toFixed(1)}% increase)</p>
      </div>
      <div class="summary-block">
        <p><b>Crypto Stack:</b> ${tokensNow.toFixed(4)} ${SYM} worth $${finalValue.toFixed(2)}</p>
      </div>
      <div class="summary-block">
        <p><b>Net Result:</b> ${profitIfSold >= 0 ? "✅ PROFIT" : "❌ LOSS"} of $${Math.abs(profitIfSold).toFixed(2)}</p>
        <p><small>Crypto value minus debt = $${finalValue.toFixed(2)} - $${remainingDebt.toFixed(2)}</small></p>
      </div>
      <div class="summary-block">
        <p><b>Projection:</b> Based on ${periodLabel} historical avg return of ${(avgDailyReturn * 100).toFixed(3)}% daily</p>
        <p><b>${SYM} Price:</b> $${p0.toFixed(2)} → $${projectedFinalPrice.toFixed(2)} (${months} months)</p>
      </div>
      <h3>Analysis</h3>
      <ul>
        ${crossover
          ? `<li>✅ Your ${SYM} stack overtakes debt value at month <b>${crossover}</b></li>`
          : `<li>❌ Your ${SYM} stack never catches up to debt within ${months} months</li>`}
        <li>💸 Interest accrued by ignoring debt: $${totalInterest.toFixed(2)}</li>
        <li>📊 Average crypto buy price: $${avgBuyPrice.toFixed(2)} per ${SYM}</li>
        <li>🎯 Strategy ${profitIfSold >= 0 ? "SUCCEEDS" : "FAILS"}: ${profitIfSold >= 0 ? "Crypto gains beat debt interest" : "Debt interest beats crypto gains"}</li>
        ${extraInsight}
      </ul>
    `;
  
    window.currentChart?.destroy();
    const ctx = document.getElementById("chart").getContext("2d");
    window.currentChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: Array.from({ length: months }, (_, i) => `M${i+1}`),
        datasets: [
          { label: "Debt Remaining", data: debtData, borderColor: "#e74c3c", tension: .3, pointRadius: 0 },
          { label: `${SYM} Stack Value`, data: dcaData, borderColor: "#2ecc71", tension: .3, pointRadius: 0 }
        ]
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: "#eee" } },
          tooltip: {
            callbacks: {
              afterBody: items => {
                const idx = items[0].dataIndex;
                const stack = dcaData[idx];
                const debtV = debtData[idx];
                if (stack > debtV) {
                  return [`Profit if sold: $${(stack - debtV).toFixed(2)}`];
                }
              }
            }
          }
        },
        scales: { x:{ ticks:{color:"#ccc"} }, y:{ ticks:{color:"#ccc"} } },
        hover: {
          mode: 'index',
          intersect: false,
          onHover: (e, items) => {
            e.native.target.style.cursor = items.length ? 'pointer' : 'default';
          }
        }
      }
    });
  }