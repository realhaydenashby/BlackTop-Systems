import { getUncachableStripeClient } from './stripeClient';

async function seedProducts() {
  const stripe = await getUncachableStripeClient();
  
  console.log('Creating BlackTop Pro subscription product...');

  const existingProducts = await stripe.products.search({ 
    query: "name:'BlackTop Pro'" 
  });
  
  if (existingProducts.data.length > 0) {
    console.log('BlackTop Pro product already exists:', existingProducts.data[0].id);
    
    const existingPrices = await stripe.prices.list({
      product: existingProducts.data[0].id,
      active: true,
    });
    
    if (existingPrices.data.length > 0) {
      console.log('Price already exists:', existingPrices.data[0].id);
      return;
    }
  }

  const product = await stripe.products.create({
    name: 'BlackTop Pro',
    description: 'Full access to BlackTop financial diagnostics with AI copilot, unlimited bank connections, and proactive alerts.',
    metadata: {
      tier: 'pro',
      features: 'ai_copilot,bank_connect,alerts,forecasting',
    },
  });

  console.log('Created product:', product.id);

  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 4900,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: {
      plan: 'monthly',
    },
  });

  console.log('Created monthly price ($49/mo):', monthlyPrice.id);

  const yearlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 47000,
    currency: 'usd',
    recurring: { interval: 'year' },
    metadata: {
      plan: 'yearly',
      savings: '17%',
    },
  });

  console.log('Created yearly price ($470/yr - save 17%):', yearlyPrice.id);

  console.log('\nProduct setup complete!');
  console.log('Product ID:', product.id);
  console.log('Monthly Price ID:', monthlyPrice.id);
  console.log('Yearly Price ID:', yearlyPrice.id);
}

seedProducts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error seeding products:', error);
    process.exit(1);
  });
