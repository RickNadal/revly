-- Update dealer tier prices: Basic £29/mo, Pro £79/mo
update public.business_tiers
set monthly_price_cents = 2900
where id = 'dealer_basic';

update public.business_tiers
set monthly_price_cents = 7900
where id = 'dealer_pro';
