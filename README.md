# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Stripe billing setup (Dealer subscriptions)

This app includes Stripe billing hooks for dealer subscriptions using Supabase Edge Functions:

- `create-stripe-checkout`
- `stripe-webhook`

### 1) Create Stripe products/prices

In Stripe Dashboard:

1. Create product `Dealer Basic` with recurring monthly price.
2. Create product `Dealer Pro` with recurring monthly price.
3. Copy both Price IDs (`price_...`).

### 2) Add Supabase function secrets

Run in PowerShell (linked project):

```powershell
cd c:\Users\renfp\revly
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx --linked
supabase secrets set STRIPE_PRICE_DEALER_BASIC=price_xxx --linked
supabase secrets set STRIPE_PRICE_DEALER_PRO=price_xxx --linked
supabase secrets set STRIPE_CHECKOUT_SUCCESS_URL=https://your-domain.com/billing/success --linked
supabase secrets set STRIPE_CHECKOUT_CANCEL_URL=https://your-domain.com/billing/cancel --linked
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx --linked
```

### 3) Deploy functions

```powershell
cd c:\Users\renfp\revly
supabase functions deploy create-stripe-checkout --linked
supabase functions deploy stripe-webhook --linked
```

### 4) Configure Stripe webhook endpoint

In Stripe Dashboard, create a webhook endpoint pointing to:

`https://<your-project-ref>.functions.supabase.co/stripe-webhook`

Subscribe to events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Use the webhook signing secret as `STRIPE_WEBHOOK_SECRET`.

### 5) App flow

1. Approve dealer account in admin/mod tools.
2. User opens Dealer account screen.
3. If status is `Approved, waiting on billing`, tap `Activate billing`.
4. App opens Stripe Checkout URL from `create-stripe-checkout`.
5. On successful checkout, webhook updates `business_subscriptions` to active/trialing.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
