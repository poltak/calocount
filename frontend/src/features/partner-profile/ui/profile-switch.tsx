import type { Profile } from "@app/common/features/core/utils/profile";
import { Link } from "react-router";
import { cx } from "../../core/utils/class-names.js";

/** The links between the owner's log and the partner's log. The partner page keeps them even when the profile is off, so a page that lost its profile still links back. */
export function ProfileSwitch({
  profile,
  partnerProfileEnabled,
}: {
  profile: Profile;
  partnerProfileEnabled: boolean;
}) {
  if (!partnerProfileEnabled && profile !== "partner") {
    return null;
  }
  return (
    <nav className="profile-switch" aria-label="Profile">
      <Link
        className={cx("profile-switch-link", profile === "owner" && "active")}
        to="/owner"
        aria-current={profile === "owner" ? "page" : undefined}
      >
        Owner
      </Link>
      <Link
        className={cx("profile-switch-link", profile === "partner" && "active")}
        to="/owner/partner"
        aria-current={profile === "partner" ? "page" : undefined}
      >
        Partner
      </Link>
    </nav>
  );
}
