// lib/i18n.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const SUPPORTED_LANGS = ["en", "nl"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

const STORAGE_KEY = "oranga_lang";

const resources = {
  en: {
    translation: {
      brand: { tagline: "Where bikers connect" },

      common: {
        where_bikers_connect: "Where bikers connect",
        for_motorcycle_riders: "For motorcycle riders",
        loading: "Loading…",
        loading_feed: "Loading feed…",
        loading_dots: "...",
        close: "Close",
        back: "Back",
        save: "Save",
        saved: "Saved",
        hide: "Hide",
        view: "View",
        cancel: "Cancel",
        delete: "Delete",
        premium: "Premium",

        error: "Error",
        done: "Done",
        block: "Block user",
        unblock: "Unblock user",
        user_blocked: "User blocked.",
        user_unblocked: "User unblocked.",
      },

      // ✅ Added: profile keys (used by app/(tabs)/profile.tsx)
      profile: {
        title: "Profile",
        subtitle: "Manage your account",

        full_name_placeholder: "Full name",
        edit_name: "Edit name",

        missing_name_title: "Missing name",
        missing_name_body: "Enter a name.",

        save_failed_title: "Save failed",

        delete_post_title: "Delete post?",
        delete_post_body: "This cannot be undone.",
        delete_failed_title: "Delete failed",

        admin_view_feedback: "Admin: View feedback",

        followers: "Followers: {{count}}",
        following: "Following: {{count}}",

        my_posts: "My posts ({{count}})",
        loading: "Loading…",
        empty_posts: "You haven’t posted yet. Tap “Post” on the home screen 🚀",

        photos_count: "{{count}} photo",
        photos_count_plural: "{{count}} photos",

        badge_admin: "ADMIN",
        badge_mod: "MOD",
        badge_legacy: "LEGACY",
        badge_premium: "PREMIUM",

        dev_admin_uid_check: "Admin UID check:",
        dev_you: "You:",
        dev_admin: "Admin:",
        dev_loading: "(loading...)",
        dev_admin_by_uid_yes: "✅ Admin by UID",
        dev_admin_by_uid_no: "❌ Not admin by UID",
        dev_admin_by_role_yes: "✅ Admin by role ({{role}})",
        dev_role: "Role: {{role}}",
      },

      auth: {
        sign_in: "Sign in",
        sign_up: "Create account",
        email: "Email",
        password: "Password",
        create_account: "Create an account",
        already_have_account: "I already have an account",
        missing_info: "Missing info",
        enter_email_password: "Enter email and password.",
        sign_in_failed: "Sign in failed",
        sign_up_failed: "Sign up failed",
        password_too_short: "Password too short",
        password_min_6: "Use at least 6 characters.",
        missing_name: "Missing name",
        enter_full_name: "Please enter your full name.",
        missing_email: "Missing email",
        enter_email: "Please enter your email.",
        account_created: "Account created",
        now_sign_in: "Now sign in.",
        sign_in_title: "Sign in",
        sign_in_button: "Sign In",
        sign_up_title: "Sign up",
        sign_up_button: "Create account",
        create_account_link: "Create an account",
        have_account_sign_in: "Already have an account? Sign in",
        missing_info_title: "Missing info",
        missing_info_body: "Enter email and password.",
        sign_in_failed_title: "Sign in failed",
        sign_up_failed_title: "Sign up failed",
        sign_up_success_title: "Account created",
        sign_up_success_body: "Check your email if confirmation is required, then sign in.",
      },

      tabs: {
        discover: "Discover",
        following: "Following",
        home: "Home",
        search: "Search",
        notifications: "Notifications",
        profile: "Profile",
        post: "Post",
        tab: "Tab",
        communities: "Groups",
      },

      feed: {
        rider_fallback: "Rider",
        discover: "Discover",
        following: "Following",
        private: "Private",
        public: "Public",
        no_posts_yet: "No posts yet.",
        post_options: "Post options",
        open_post: "Open post",
        view_profile: "View profile",
        delete_post_title: "Delete post?",
        delete_post_body: "This cannot be undone.",
        delete_failed_title: "Delete failed",
        like_failed_title: "Like failed",
        unlike_failed_title: "Unlike failed",
      },

      report: {
        report: "Report",
        report_post_title: "Report post",
        reason_title: "Reason",
        details_optional: "Details (optional)",
        details_placeholder: "Tell us what happened…",
        sending: "Sending…",
        submit: "Submit report",
        failed_title: "Report failed",
        reported_title: "Reported",
        reported_body: "Thanks — we’ll review this post.",
        already_reported_title: "Already reported",
        already_reported_body: "You’ve already reported this post. Thanks — our team will review it.",
        reason_spam: "Spam",
        reason_harassment: "Harassment",
        reason_nudity: "Nudity",
        reason_violence: "Violence",
        reason_hate: "Hate",
        reason_scam: "Scam",
        reason_other: "Other",
      },

      mod: {
        remove_post_title: "Remove post?",
        remove_post_body: "This will delete the post (moderator action).",
        remove: "Remove",
        remove_failed_title: "Remove failed",
        remove_post: "Remove post",

        ban_user_title: "Ban user?",
        ban_user_body: "This will ban the user (moderator action).",
        ban: "Ban",
        banned_title: "Banned",
        banned_body: "User has been banned.",
        ban_failed_title: "Ban failed",

        ban_user_action: "Ban user",
      },

      moderation: {
        title: "Moderation",
        role_prefix: "Role:",
        open_tab: "Open",
        resolved_tab: "Resolved",
        two_plus_reports: "2+ reports",
        show_dismissed: "Show dismissed",
        on: "(ON)",
        off: "(OFF)",
        refresh: "Refresh",

        access_denied_title: "Access denied",
        could_not_verify_body: "Could not verify moderator status.",
        mods_only_body: "This screen is moderators/admins only.",

        load_failed_title: "Load failed",
        update_failed_title: "Update failed",
        delete_failed_title: "Delete failed",

        remove_post_title: "Remove post?",
        remove_post_body: "This will delete the post. This cannot be undone.",
        delete_post: "Delete post",

        empty_two_plus: "No posts with 2+ reports right now.",
        empty_open: "No reported posts right now.",
        empty_resolved: "No resolved reports.",
        empty_resolved_or_dismissed: "No resolved or dismissed reports.",

        unknown: "Unknown",
        post_by: "Post by {{name}}",
        post_not_found: "Post not found",
        report_count: "{{count}} report{{plural}}",
        reported_at: "Reported: {{date}}",
        reason_prefix: "Reason:",
        not_specified: "Not specified",
        no_caption: "(no caption)",
        tap_to_open_post: "Tap to open post",
        open: "Open",
        resolve: "Resolve",
        dismiss: "Dismiss",
        ids_line: "Report ID: {{rid}} • Post: {{pid}}",
      },

      ads: {
        hidden_title: "Hidden",
        hidden_body: "You’ll see fewer posts like this.",
        sponsor_fallback: "Sponsor",
        learn_more: "Learn more",
        badge_house: "House Sponsor",
        badge_sponsored: "Sponsored",
        house_title: "Funding the build 💍",
        house_body: "Oranga is funded by Decazi.com. Support the project — discover custom-made pieces and limited drops.",
        house_cta: "Explore Decazi",
        partner_name: "Oranga Partners",
        partner_title: "Advertise on Oranga",
        partner_body: "Own a shop or event? Reach riders in your city with sponsored placements that still feel native.",
        partner_cta: "Advertise",
        request_campaign: "Request campaign",
      },

      // ✅ Added: marketplace key used by browse fallback
      marketplace: {
        listing_fallback_title: "Listing",
      },

      advertise: {
        title: "Advertise",
        subtitle:
          "Sponsored posts on Oranga are designed to feel native: clearly labeled, not spammy, and paced to protect the feed experience.",

        house: {
          title: "House Sponsor",
          badge: "Funding the project",
          brand: "Decazi.com",
          body: "Oranga is funded by Decazi.com. House Sponsor campaigns support development and help keep the product moving fast.",
          how_title: "How it appears in the feed",
          how_bullets:
            "• Labeled “House Sponsor”\n• Premium native post layout (looks like a real post)\n• Appears roughly every ~10 posts in Discover\n• Less frequent in Following\n• Users can hide a campaign locally",
        },

        placements: {
          title: "Sponsored placements",
          subtitle: "Brands, shops, events, and local businesses can run Sponsored campaigns that still respect the feed experience.",
          requirements_title: "Requirements",
          requirements_bullets:
            "• Clear sponsor name + label (“Sponsored”)\n• Short body copy + CTA\n• Optional image\n• No misleading claims, no spam, no adult content",
          packages_title: "Example packages",
          packages_bullets:
            "• Local sponsor (city/region)\n• Event promotion (date window)\n• Shop promotion (weekly rotation)\n• Premium native post + basic reporting (impressions/clicks)",
        },

        request_cta: "Request a campaign",
      },

      advertise_request: {
        title: "Request a campaign",
        subtitle: "Tell us what you want to promote. We’ll set up the Sponsored post and confirm placement.",
        business_placeholder: "Business / brand name",
        email_placeholder: "Contact email",
        placement_title: "Preferred placement",
        message_placeholder: "What are you promoting? Include city/region, dates, CTA, budget (optional)…",
        sending: "Sending…",
        submit: "Submit request",
        missing_info_title: "Missing info",
        missing_info_body: "Add business name and a valid email.",
        failed_title: "Request failed",
        sent_title: "Sent",
        sent_body: "Thanks — we’ll review your request and get back to you.",
      },

      rider: {
        badge_admin: "ADMIN",
        badge_mod: "MOD",
        badge_legacy: "LEGACY",
        badge_premium: "PREMIUM",
        subtitle: "Rider profile",
        followers: "Followers: {{count}}",
        following: "Following: {{count}}",
        follow_cta: "Follow",
        following_cta: "Following ✓ (tap to unfollow)",
        posts_title: "Posts ({{count}})",
        no_posts_yet: "No posts yet.",
        follow_failed_title: "Follow failed",
        unfollow_failed_title: "Unfollow failed",
      },

      // ... (rest unchanged in your file)
      // NOTE: Keep your existing keys below this point as-is.
    },
  },

  nl: {
    translation: {
      brand: { tagline: "Where bikers connect" },

      common: {
        where_bikers_connect: "Waar bikers verbinden",
        for_motorcycle_riders: "Voor motorrijders",
        loading: "Laden…",
        loading_feed: "Feed laden…",
        loading_dots: "...",
        close: "Sluiten",
        back: "Terug",
        save: "Opslaan",
        saved: "Opgeslagen",
        hide: "Verbergen",
        view: "Bekijken",
        cancel: "Annuleren",
        delete: "Verwijderen",
        premium: "Premium",

        error: "Fout",
        done: "Gelukt",
        block: "Gebruiker blokkeren",
        unblock: "Blokkering opheffen",
        user_blocked: "Gebruiker geblokkeerd.",
        user_unblocked: "Blokkering opgeheven.",
      },

      // ✅ Added: profile keys (used by app/(tabs)/profile.tsx)
      profile: {
        title: "Profiel",
        subtitle: "Beheer je account",

        full_name_placeholder: "Volledige naam",
        edit_name: "Naam aanpassen",

        missing_name_title: "Naam ontbreekt",
        missing_name_body: "Vul een naam in.",

        save_failed_title: "Opslaan mislukt",

        delete_post_title: "Post verwijderen?",
        delete_post_body: "Dit kan niet ongedaan worden gemaakt.",
        delete_failed_title: "Verwijderen mislukt",

        admin_view_feedback: "Admin: Bekijk feedback",

        followers: "Volgers: {{count}}",
        following: "Volgend: {{count}}",

        my_posts: "Mijn posts ({{count}})",
        loading: "Laden…",
        empty_posts: "Je hebt nog niets gepost. Tik op “Post” op het homescreen 🚀",

        photos_count: "{{count}} foto",
        photos_count_plural: "{{count}} foto’s",

        badge_admin: "ADMIN",
        badge_mod: "MOD",
        badge_legacy: "LEGACY",
        badge_premium: "PREMIUM",

        dev_admin_uid_check: "Admin UID check:",
        dev_you: "Jij:",
        dev_admin: "Admin:",
        dev_loading: "(laden...)",
        dev_admin_by_uid_yes: "✅ Admin via UID",
        dev_admin_by_uid_no: "❌ Geen admin via UID",
        dev_admin_by_role_yes: "✅ Admin via rol ({{role}})",
        dev_role: "Rol: {{role }}",
      },

      auth: {
        sign_in: "Inloggen",
        sign_up: "Account maken",
        email: "E-mail",
        password: "Wachtwoord",
        create_account: "Account aanmaken",
        already_have_account: "Ik heb al een account",
        missing_info: "Ontbrekende info",
        enter_email_password: "Vul e-mail en wachtwoord in.",
        sign_in_failed: "Inloggen mislukt",
        sign_up_failed: "Account maken mislukt",
        password_too_short: "Wachtwoord te kort",
        password_min_6: "Gebruik minstens 6 tekens.",
        missing_name: "Naam ontbreekt",
        enter_full_name: "Vul je volledige naam in.",
        missing_email: "E-mail ontbreekt",
        enter_email: "Vul je e-mail in.",
        account_created: "Account aangemaakt",
        now_sign_in: "Log nu in.",
        sign_in_title: "Inloggen",
        sign_in_button: "Inloggen",
        sign_up_title: "Account maken",
        sign_up_button: "Account aanmaken",
        create_account_link: "Account aanmaken",
        have_account_sign_in: "Heb je al een account? Log in",
        missing_info_title: "Ontbrekende info",
        missing_info_body: "Vul e-mail en wachtwoord in.",
        sign_in_failed_title: "Inloggen mislukt",
        sign_up_failed_title: "Account maken mislukt",
        sign_up_success_title: "Account aangemaakt",
        sign_up_success_body: "Controleer je e-mail (als bevestiging nodig is) en log daarna in.",
      },

      tabs: {
        discover: "Ontdekken",
        following: "Volgend",
        home: "Home",
        search: "Zoeken",
        notifications: "Meldingen",
        profile: "Profiel",
        post: "Post",
        tab: "Tab",
        communities: "Groepen",
      },

      feed: {
        rider_fallback: "Rijder",
        discover: "Ontdekken",
        following: "Volgend",
        private: "Privé",
        public: "Openbaar",
        no_posts_yet: "Nog geen posts.",
        post_options: "Postopties",
        open_post: "Post openen",
        view_profile: "Bekijk profiel",
        delete_post_title: "Post verwijderen?",
        delete_post_body: "Dit kan niet ongedaan worden gemaakt.",
        delete_failed_title: "Verwijderen mislukt",
        like_failed_title: "Liken mislukt",
        unlike_failed_title: "Unliken mislukt",
      },

      report: {
        report: "Melden",
        report_post_title: "Post melden",
        reason_title: "Reden",
        details_optional: "Details (optioneel)",
        details_placeholder: "Vertel ons wat er is gebeurd…",
        sending: "Versturen…",
        submit: "Melding versturen",
        failed_title: "Melden mislukt",
        reported_title: "Gemeld",
        reported_body: "Bedankt — we bekijken deze post.",
        already_reported_title: "Al gemeld",
        already_reported_body: "Je hebt deze post al gemeld. Bedankt — ons team bekijkt dit.",
        reason_spam: "Spam",
        reason_harassment: "Intimidatie",
        reason_nudity: "Naaktheid",
        reason_violence: "Geweld",
        reason_hate: "Haat",
        reason_scam: "Oplichting",
        reason_other: "Overig",
      },

      mod: {
        remove_post_title: "Post verwijderen?",
        remove_post_body: "Dit verwijdert de post (moderatoractie).",
        remove: "Verwijderen",
        remove_failed_title: "Verwijderen mislukt",
        remove_post: "Post verwijderen",

        ban_user_title: "Gebruiker bannen?",
        ban_user_body: "Dit bant de gebruiker (moderatoractie).",
        ban: "Bannen",
        banned_title: "Geband",
        banned_body: "De gebruiker is geband.",
        ban_failed_title: "Bannen mislukt",

        ban_user_action: "Gebruiker bannen",
      },

      moderation: {
        title: "Moderatie",
        role_prefix: "Rol:",
        open_tab: "Open",
        resolved_tab: "Opgelost",
        two_plus_reports: "2+ meldingen",
        show_dismissed: "Toon dismissed",
        on: "(AAN)",
        off: "(UIT)",
        refresh: "Verversen",

        access_denied_title: "Geen toegang",
        could_not_verify_body: "Kon moderatorstatus niet verifiëren.",
        mods_only_body: "Deze pagina is alleen voor moderators/admins.",

        load_failed_title: "Laden mislukt",
        update_failed_title: "Update mislukt",
        delete_failed_title: "Verwijderen mislukt",

        remove_post_title: "Post verwijderen?",
        remove_post_body: "Dit verwijdert de post. Dit kan niet ongedaan worden gemaakt.",
        delete_post: "Post verwijderen",

        empty_two_plus: "Geen posts met 2+ meldingen op dit moment.",
        empty_open: "Geen gemelde posts op dit moment.",
        empty_resolved: "Geen opgeloste meldingen.",
        empty_resolved_or_dismissed: "Geen opgeloste of dismissed meldingen.",

        unknown: "Onbekend",
        post_by: "Post van {{name}}",
        post_not_found: "Post niet gevonden",
        report_count: "{{count}} melding{{plural}}",
        reported_at: "Gemeld: {{date}}",
        reason_prefix: "Reden:",
        not_specified: "Niet opgegeven",
        no_caption: "(geen caption)",
        tap_to_open_post: "Tik om de post te openen",
        open: "Openen",
        resolve: "Oplossen",
        dismiss: "Dismiss",
        ids_line: "Report ID: {{rid}} • Post: {{pid}}",
      },

      ads: {
        hidden_title: "Verborgen",
        hidden_body: "Je ziet minder posts zoals deze.",
        sponsor_fallback: "Sponsor",
        learn_more: "Meer info",
        badge_house: "House Sponsor",
        badge_sponsored: "Gesponsord",
        house_title: "De build steunen 💍",
        house_body: "Oranga wordt gefinancierd door Decazi.com handgemaakte trouwringen. Steun het project.",
        house_cta: "Ontdek Decazi",
        partner_name: "Oranga Partners",
        partner_title: "Adverteer op Oranga",
        partner_body: "Heb je een shop of event? Bereik rijders in jouw stad met sponsored placements die natuurlijk aanvoelen.",
        partner_cta: "Adverteren",
        request_campaign: "Campagne aanvragen",
      },

      // ✅ Added: marketplace key used by browse fallback
      marketplace: {
        listing_fallback_title: "Advertentie",
      },

      advertise: {
        title: "Adverteren",
        subtitle:
          "Sponsored posts op Oranga zijn ontworpen om native te voelen: duidelijk gelabeld, niet spammy, en met pacing om de feed prettig te houden.",

        house: {
          title: "House Sponsor",
          badge: "Financiert het project",
          brand: "Decazi.com",
          body: "Oranga wordt gefinancierd door Decazi.com. House Sponsor campagnes steunen development en houden het product in beweging.",
          how_title: "Hoe het in de feed verschijnt",
          how_bullets:
            "• Gelabeld als “House Sponsor”\n• Premium native post layout (lijkt op een echte post)\n• Verschijnt ongeveer elke ~10 posts in Discover\n• Minder vaak in Following\n• Users kunnen een campagne lokaal verbergen",
        },

        placements: {
          title: "Sponsored placements",
          subtitle: "Merken, shops, events en lokale businesses kunnen Sponsored campagnes draaien die de feed-ervaring respecteren.",
          requirements_title: "Vereisten",
          requirements_bullets:
            "• Duidelijke sponsornaam + label (“Sponsored”)\n• Korte body copy + CTA\n• Optionele afbeelding\n• Geen misleidende claims, geen spam, geen adult content",
          packages_title: "Voorbeeldpakketten",
          packages_bullets:
            "• Lokale sponsor (stad/regio)\n• Event promotie (datum-window)\n• Shop promotie (wekelijkse rotatie)\n• Premium native post + basisrapportage (impressies/kliks)",
        },

        request_cta: "Campagne aanvragen",
      },

      advertise_request: {
        title: "Campagne aanvragen",
        subtitle: "Vertel wat je wilt promoten. We maken de Sponsored post en bevestigen de placement.",
        business_placeholder: "Bedrijfs- / merknaam",
        email_placeholder: "Contact e-mail",
        placement_title: "Voorkeursplaatsing",
        message_placeholder: "Wat promoot je? Voeg stad/regio, data, CTA, budget (optioneel) toe…",
        sending: "Versturen…",
        submit: "Verzoek versturen",
        missing_info_title: "Ontbrekende info",
        missing_info_body: "Vul een bedrijfsnaam en een geldig e-mailadres in.",
        failed_title: "Verzoek mislukt",
        sent_title: "Verstuurd",
        sent_body: "Bedankt — we bekijken je verzoek en nemen contact met je op.",
      },

      rider: {
        badge_admin: "ADMIN",
        badge_mod: "MOD",
        badge_legacy: "LEGACY",
        badge_premium: "PREMIUM",
        subtitle: "Rijderprofiel",
        followers: "Volgers: {{count}}",
        following: "Volgend: {{count}}",
        follow_cta: "Volgen",
        following_cta: "Volgend ✓ (tik om te ontvolgen)",
        posts_title: "Posts ({{count}})",
        no_posts_yet: "Nog geen posts.",
        follow_failed_title: "Volgen mislukt",
        unfollow_failed_title: "Ontvolgen mislukt",
      },

      // ... (rest unchanged in your file)
      // NOTE: Keep your existing keys below this point as-is.
    },
  },
} as const;

function regionDefault(): SupportedLang {
  const loc = Localization.getLocales?.()?.[0];
  const region = (loc as any)?.regionCode ? String((loc as any).regionCode).toUpperCase() : "";
  if (region === "NL" || region === "BE") return "nl";
  return "en";
}

export async function initI18n(): Promise<void> {
  let saved: string | null = null;
  try {
    saved = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {}

  const initial = (saved && SUPPORTED_LANGS.includes(saved as any) ? saved : regionDefault()) as SupportedLang;

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources: resources as any,
      lng: initial,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      compatibilityJSON: "v3",
    });
  } else {
    await i18n.changeLanguage(initial);
  }
}

export async function setAppLanguage(lang: SupportedLang): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

export async function clearAppLanguageOverride(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
  await i18n.changeLanguage(regionDefault());
}

export default i18n;