// Configuration
const REFRESH_INTERVAL = 60; // seconds
const PREDICTION_WINDOW = 10; // minutes
let currentTicker = '';
let autoRefreshInterval = null;

const fetchBtn = document.getElementById('fetchBtn');
const tickerInput = document.getElementById('tickerInput');
const stockTitle = document.getElementById('stockTitle');
const lastUpdated = document.getElementById('lastUpdated');
const newsContainer = document.getElementById('newsContainer');
const predictionValues = document.getElementById('predictionValues');

// Initialize Bootstrap tabs
const tabElms = document.querySelectorAll('.nav-link[data-bs-toggle="tab"]');
tabElms.forEach(tabElm => {
    tabElm.addEventListener('click', function(event) {
        event.preventDefault();
        const tab = new bootstrap.Tab(this);
        tab.show();
    });
});

fetchBtn.addEventListener('click', fetchStockData);
tickerInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') fetchStockData();
});

function fetchStockData() {
    const ticker = tickerInput.value.trim().toUpperCase();
    if (!ticker) return;
    currentTicker = ticker;
    stockTitle.textContent = `${ticker} Analysis`;
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    loadData();
    autoRefreshInterval = setInterval(loadData, REFRESH_INTERVAL * 1000);
}

function loadData() {
    showLoading(true);
    fetch(`/api/stock/${currentTicker}`)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            lastUpdated.textContent = `Last updated: ${data.last_updated}`;
            updateCharts(data);
            updateNews(data.news);
        })
        .catch(error => {
            console.error('Error:', error);
            alert(`Error loading data for ${currentTicker}: ${error.message}`);
        })
        .finally(() => showLoading(false));
}

function updateCharts(data) {
    if (!data.prices || data.prices.length === 0) {
        console.error('No price data available');
        return;
    }

    const dates = data.prices.map(item => new Date(item.Datetime));
    const closes = data.prices.map(item => item.Close);

    // Main Chart
    Plotly.newPlot('mainChart', [{
        x: dates,
        close: closes,
        high: data.prices.map(item => item.High),
        low: data.prices.map(item => item.Low),
        open: data.prices.map(item => item.Open),
        type: 'candlestick',
        name: currentTicker,
        increasing: {line: {color: 'green'}},
        decreasing: {line: {color: 'red'}}
    }], {
        title: `${currentTicker} Price`,
        xaxis: {title: 'Time'},
        yaxis: {title: 'Price'},
        plot_bgcolor: '#16213e',
        paper_bgcolor: '#16213e',
        font: {color: '#e6e6e6'}
    });

    // RSI Chart
    if (data.indicators && data.indicators.RSI) {
        Plotly.newPlot('rsiChart', [{
            x: dates,
            y: data.indicators.RSI,
            type: 'line',
            name: 'RSI',
            line: {color: 'cyan'}
        }], {
            title: 'RSI (14)',
            shapes: [
                {type: 'line', y0: 30, y1: 30, x0: dates[0], x1: dates[dates.length-1], line: {color: 'red', dash: 'dash'}},
                {type: 'line', y0: 70, y1: 70, x0: dates[0], x1: dates[dates.length-1], line: {color: 'green', dash: 'dash'}}
            ],
            plot_bgcolor: '#16213e',
            paper_bgcolor: '#16213e',
            font: {color: '#e6e6e6'}
        });
    }

    // MACD Chart
    if (data.indicators && data.indicators.MACD && data.indicators.MACD_Signal && data.indicators.MACD_Hist) {
        const macdColors = data.indicators.MACD_Hist.map(val => val >= 0 ? 'rgba(0,255,0,0.7)' : 'rgba(255,0,0,0.7)');
        Plotly.newPlot('macdChart', [
            {x: dates, y: data.indicators.MACD, type: 'line', name: 'MACD', line: {color: 'blue'}},
            {x: dates, y: data.indicators.MACD_Signal, type: 'line', name: 'Signal', line: {color: 'orange'}},
            {x: dates, y: data.indicators.MACD_Hist, type: 'bar', name: 'Histogram', marker: {color: macdColors}}
        ], {
            title: 'MACD (12, 26, 9)',
            plot_bgcolor: '#16213e',
            paper_bgcolor: '#16213e',
            font: {color: '#e6e6e6'}
        });
    }

    // Bollinger Bands Chart
    if (data.indicators && data.indicators.BB_Upper && data.indicators.BB_Middle && data.indicators.BB_Lower) {
        Plotly.newPlot('bbChart', [
            {x: dates, y: data.indicators.BB_Upper, name: 'Upper Band', type: 'line', line: {color: 'rgba(0,255,0,0.5)'}},
            {x: dates, y: data.indicators.BB_Middle, name: 'Middle Band', type: 'line', line: {color: 'white'}},
            {x: dates, y: data.indicators.BB_Lower, name: 'Lower Band', type: 'line', line: {color: 'rgba(255,0,0,0.5)'}}
        ], {
            title: 'Bollinger Bands',
            plot_bgcolor: '#16213e',
            paper_bgcolor: '#16213e',
            font: {color: '#e6e6e6'}
        });
    }

    // Prediction Chart
    if (data.predictions) {
        const futureDates = [];
        for (let i = 1; i <= PREDICTION_WINDOW; i++) {
            const lastDate = new Date(dates[dates.length-1]);
            futureDates.push(new Date(lastDate.getTime() + i * 60000));
        }

        const predictionData = [
            {x: dates, y: closes, type: 'line', name: 'Actual', line: {color: 'blue'}},
            {x: dates, y: data.predictions.linear.current, type: 'line', name: 'Linear', line: {color: 'orange', dash: 'dot'}},
            {x: dates, y: data.predictions.quadratic.current, type: 'line', name: 'Quadratic', line: {color: 'green', dash: 'dot'}},
            {x: futureDates, y: data.predictions.linear.future, type: 'scatter', mode: 'markers+lines', name: 'Linear Pred', line: {color: 'orange'}},
            {x: futureDates, y: data.predictions.quadratic.future, type: 'scatter', mode: 'markers+lines', name: 'Quadratic Pred', line: {color: 'green'}}
        ];

        Plotly.newPlot('predictionChart', predictionData, {
            title: 'Price Predictions',
            plot_bgcolor: '#16213e',
            paper_bgcolor: '#16213e',
            font: {color: '#e6e6e6'}
        });

        const lastPrice = closes[closes.length-1];
        predictionValues.innerHTML = '';
        ['linear', 'quadratic', 'cubic'].forEach(model => {
            if (data.predictions[model]) {
                const pred = data.predictions[model].future[data.predictions[model].future.length - 1];
                const change = ((pred - lastPrice) / lastPrice * 100).toFixed(2);
                const color = change >= 0 ? 'success' : 'danger';
                predictionValues.innerHTML += `
                    <div class="text-center">
                        <span class="badge bg-secondary">${model}</span>
                        <div class="h5 text-${color}">${pred.toFixed(2)}</div>
                        <small class="text-${color}">${change}%</small>
                    </div>
                `;
            }
        });
    }
}

function updateNews(news) {
    newsContainer.innerHTML = '<p class="text-muted">No news available</p>';
}

function showLoading(show) {
    fetchBtn.disabled = show;
    fetchBtn.innerHTML = show ? '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...' : 'Analyze';
}

window.addEventListener('DOMContentLoaded', () => {
    currentTicker = tickerInput.value.trim().toUpperCase();
    fetchStockData();
});