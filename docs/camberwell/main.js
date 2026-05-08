const scenarios = [
  { id: 'bear', label: 'Bear', cagr: -3 },
  { id: 'weak', label: 'Weak', cagr: -1 },
  { id: 'flat', label: 'Flat', cagr: 0 },
  { id: 'low', label: 'Low recovery', cagr: 1.5 },
  { id: 'base', label: 'Base recovery', cagr: 2.5 },
  { id: 'strong', label: 'Strong rebound', cagr: 4 }
];

let activeScenario = 'weak';

const fields = [
  'purchasePrice',
  'holdingYears',
  'cashAvailable',
  'buyingCosts',
  'financeRate',
  'rentAvoided',
  'bills',
  'lodgerRent',
  'taxRate',
  'councilTax',
  'serviceCharge',
  'maintenanceRate',
  'insurance',
  'vacancyRate',
  'saleCostRate',
  'trustRate'
];

const money = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0
});

function value(id) {
  return Number(document.getElementById(id).value);
}

function initFormatPreviews() {
  document.querySelectorAll('.money-input input').forEach((input) => {
    const preview = document.createElement('small');
    preview.className = 'format-preview';
    preview.id = `${input.id}Preview`;
    input.closest('.field').append(preview);
  });
}

function renderFormatPreviews() {
  document.querySelectorAll('.money-input input').forEach((input) => {
    const preview = document.getElementById(`${input.id}Preview`);
    if (!preview) return;
    preview.textContent = `Entered as ${money.format(Number(input.value || 0))}`;
  });
}

function standardSdlt(price) {
  const bands = [
    { threshold: 125000, rate: 0 },
    { threshold: 250000, rate: 0.02 },
    { threshold: 925000, rate: 0.05 }
  ];

  let tax = 0;
  for (let index = 1; index < bands.length; index += 1) {
    const lower = bands[index - 1].threshold;
    const upper = bands[index].threshold;
    const taxable = Math.max(0, Math.min(price, upper) - lower);
    tax += taxable * bands[index].rate;
  }
  return tax;
}

function calculate(selectedScenario = scenarios.find((item) => item.id === activeScenario)) {
  const purchasePrice = value('purchasePrice');
  const holdingYears = value('holdingYears');
  const sdlt = standardSdlt(purchasePrice);
  const upfrontCost = purchasePrice + sdlt + value('buyingCosts');
  const borrowing = Math.max(0, upfrontCost - value('cashAvailable'));
  const financeCost = borrowing * (value('financeRate') / 100);

  const rentSaved = value('rentAvoided') * 12;
  const lodgerGross = value('lodgerRent') * 12;
  const lodgerTaxable = Math.max(0, lodgerGross - 7500);
  const lodgerTax = lodgerTaxable * (value('taxRate') / 100);
  const lodgerNet = lodgerGross - lodgerTax;
  const maintenance = purchasePrice * (value('maintenanceRate') / 100);
  const vacancy = lodgerGross * (value('vacancyRate') / 100);

  const annualBenefit =
    rentSaved +
    lodgerNet -
    value('bills') -
    value('councilTax') -
    value('serviceCharge') -
    maintenance -
    value('insurance') -
    vacancy -
    financeCost;

  const futureSaleValue = purchasePrice * (1 + selectedScenario.cagr / 100) ** holdingYears;
  const saleCosts = futureSaleValue * (value('saleCostRate') / 100);
  const propertyRoute = futureSaleValue - saleCosts + annualBenefit * holdingYears - upfrontCost;
  const trustRoute = upfrontCost * (1 + value('trustRate') / 100) ** holdingYears - upfrontCost;
  const delta = propertyRoute - trustRoute;

  return {
    purchasePrice,
    holdingYears,
    sdlt,
    upfrontCost,
    borrowing,
    financeCost,
    rentSaved,
    lodgerNet,
    lodgerTax,
    maintenance,
    vacancy,
    annualBenefit,
    futureSaleValue,
    saleCosts,
    propertyRoute,
    trustRoute,
    delta,
    selectedScenario
  };
}

function renderScenarioButtons() {
  const wrapper = document.getElementById('scenarioButtons');
  wrapper.innerHTML = scenarios
    .map(
      (scenario) => `
        <button
          type="button"
          class="scenario-button"
          role="radio"
          aria-checked="${scenario.id === activeScenario}"
          data-scenario="${scenario.id}"
        >
          <span>${scenario.label}</span>
          <strong>${scenario.cagr > 0 ? '+' : ''}${scenario.cagr}%</strong>
        </button>
      `
    )
    .join('');

  wrapper.addEventListener('click', (event) => {
    const button = event.target.closest('[data-scenario]');
    if (!button) return;
    activeScenario = button.dataset.scenario;
    render();
  });
}

function renderChart(current) {
  const chart = document.getElementById('scenarioChart');
  const values = scenarios.map((scenario) => calculate(scenario));
  const min = Math.min(...values.map((item) => item.delta));
  const max = Math.max(...values.map((item) => item.delta));
  const span = Math.max(1, max - min);

  chart.innerHTML = values
    .map((item) => {
      const width = 18 + ((item.delta - min) / span) * 82;
      const isActive = item.selectedScenario.id === current.selectedScenario.id;
      return `
        <div class="bar-row ${isActive ? 'is-active' : ''}">
          <span>${item.selectedScenario.label}</span>
          <div class="bar-track">
            <div class="bar ${item.delta >= 0 ? 'positive' : 'negative'}" style="width: ${width}%"></div>
          </div>
          <strong>${money.format(item.delta)}</strong>
        </div>
      `;
    })
    .join('');
}

function renderBreakdown(result) {
  const rows = [
    ['Purchase price', result.purchasePrice],
    ['SDLT', result.sdlt],
    ['Finance cost per year', result.financeCost],
    ['Rent avoided', result.rentSaved],
    ['Lodger income after Rent-a-Room tax', result.lodgerNet],
    ['Maintenance reserve', -result.maintenance],
    ['Service charge', -value('serviceCharge')],
    ['Council tax', -value('councilTax')],
    ['Bills now paid by owner', -value('bills')],
    [`Sale costs in year ${result.holdingYears}`, -result.saleCosts]
  ];

  document.getElementById('breakdownList').innerHTML = rows
    .map(
      ([label, amount]) => `
        <div>
          <dt>${label}</dt>
          <dd>${money.format(amount)}</dd>
        </div>
      `
    )
    .join('');
}

function render() {
  const result = calculate();
  const deltaText = money.format(result.delta);

  document.getElementById('purchasePriceOut').textContent = money.format(result.purchasePrice);
  document.getElementById('holdingYearsOut').textContent = `${result.holdingYears} years`;
  document.getElementById('heroDelta').textContent = deltaText;
  document.getElementById('heroDelta').className = result.delta >= 0 ? 'positive-text' : 'negative-text';
  document.getElementById('heroSummary').textContent = `${result.selectedScenario.label} property scenario at ${result.selectedScenario.cagr}% nominal CAGR over ${result.holdingYears} years.`;

  document.getElementById('upfrontCost').textContent = money.format(result.upfrontCost);
  document.getElementById('borrowingNeed').textContent = money.format(result.borrowing);
  document.getElementById('annualBenefit').textContent = money.format(result.annualBenefit);
  document.getElementById('propertyValue').textContent = money.format(result.propertyRoute);
  document.getElementById('trustValue').textContent = money.format(result.trustRoute);
  document.getElementById('propertyDetail').textContent = `${money.format(result.futureSaleValue)} sale value before ${money.format(result.saleCosts)} selling costs after ${result.holdingYears} years.`;
  document.getElementById('trustDetail').textContent = `${value('trustRate')}% CAGR on the same upfront capital over ${result.holdingYears} years.`;
  document.getElementById('selectedScenarioLabel').textContent = `${result.selectedScenario.cagr}% nominal property CAGR`;

  document.querySelectorAll('.scenario-button').forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.scenario === activeScenario));
  });

  renderFormatPreviews();
  renderChart(result);
  renderBreakdown(result);
}

function initInfoTips() {
  document.querySelectorAll('.info-tip button').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const currentTip = button.closest('.info-tip');
      document.querySelectorAll('.info-tip.is-open').forEach((tip) => {
        if (tip !== currentTip) tip.classList.remove('is-open');
      });
      currentTip.classList.toggle('is-open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.info-tip.is-open').forEach((tip) => tip.classList.remove('is-open'));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.info-tip.is-open').forEach((tip) => tip.classList.remove('is-open'));
    }
  });
}

function init() {
  renderScenarioButtons();
  initFormatPreviews();
  initInfoTips();
  fields.forEach((id) => document.getElementById(id).addEventListener('input', render));
  render();
}

document.addEventListener('DOMContentLoaded', init);
