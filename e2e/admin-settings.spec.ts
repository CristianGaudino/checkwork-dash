import { expect, test } from "@playwright/test";
import { as } from "./open";

test("a reply time is checked, saved, and changes what the overview calls late", async ({ page }) => {
  await page.goto("/settings?section=targets");
  // Read first, changed in the house dialog. The reply time is in Timings, with the test drive slot (#150).
  await page.getByRole("button", { name: "Edit timings" }).click();
  const dialog = page.getByRole("dialog", { name: "Timings" });
  await dialog.locator('input[name="leadSlaHours"]').fill("0");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("At least 1 hour")).toBeVisible(); // a refused save keeps it open, the error by its field
  await dialog.locator('input[name="leadSlaHours"]').fill("2");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Saved. It works from now on")).toBeVisible();
  await expect(page.getByText("2 hours", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("list", { name: "To do" }).getByText(/^(Reply to|Follow up with) /).first()).toBeVisible();
});

test("a team member is added, shows in the lead owner choices, and cannot be added twice", async ({ page }) => {
  const name = `Tester ${Date.now() % 100000}`;
  const email = `tester${Date.now() % 100000}@example.com`;
  await page.goto("/settings?section=team");
  const open = async () => {
    await page.getByRole("button", { name: "Add someone" }).click();
    return page.getByRole("dialog", { name: "Add someone" });
  };
  let add = await open();
  await add.locator('input[name="name"]').fill(name);
  await add.locator('input[name="email"]').fill(email);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(add).toBeHidden();
  await expect(page.getByRole("cell", { name })).toBeVisible();
  add = await open();
  await add.locator('input[name="name"]').fill(`${name} again`);
  await add.locator('input[name="email"]').fill(email);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(add.getByText("already on the team")).toBeVisible(); // the dialog stays open with the error by its field
  page.once("dialog", (d) => d.accept());
  await page.keyboard.press("Escape");
  await page.goto("/leads");
  await page.getByRole("row").nth(1).getByRole("link").first().click();
  await page.getByRole("combobox", { name: "Who has it" }).click(); // a drop-down of the team (#135)
  await expect(page.getByRole("option", { name })).toHaveCount(1);
});

test("a person's dialog changes their name, phone and notifications, and the list says how they are reached", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now() % 100000;
  const name = `Grid ${stamp}`;
  await page.goto("/settings?section=team");
  await page.getByRole("button", { name: "Add someone" }).click();
  const add = page.getByRole("dialog", { name: "Add someone" });
  await add.locator('input[name="name"]').fill(name);
  await add.locator('input[name="email"]').fill(`grid${stamp}@example.com`);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: `Edit ${name}'s details` }).click();
  let person = page.getByRole("dialog", { name });
  // No phone yet: no WhatsApp column. Typing one brings it, as it will be saved.
  await expect(person.getByRole("checkbox", { name: "WhatsApp" })).toHaveCount(0);
  await person.getByLabel("Mobile phone").fill("+353 85 000 1234");
  await person.getByRole("group", { name: "New enquiry" }).getByRole("checkbox", { name: "WhatsApp" }).check();
  await person.getByLabel("Name", { exact: true }).fill(`${name} R`);
  await person.getByRole("button", { name: "Save" }).click();
  await expect(person).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: `${name} R` })).toContainText("Sales · WhatsApp");
  // Finance never has WhatsApp: the column goes with the role.
  await page.getByRole("button", { name: `Edit ${name} R's details` }).click();
  person = page.getByRole("dialog", { name: `${name} R` });
  await person.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("listbox").getByRole("option", { name: "Finance" }).click();
  await expect(person.getByRole("checkbox", { name: "WhatsApp" })).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page.keyboard.press("Escape");
  const member = page.getByRole("row").filter({ hasText: `${name} R` });
  await member.getByRole("button", { name: `More for ${name} R` }).click();
  await member.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(`${name} R`)).toHaveCount(0);
});

test("the sections are one at a time, in two groups; services say what is connected, WhatsApp among them", async ({ page }) => {
  await page.goto("/settings");
  // Your account first: the profile, read first.
  await expect(page.getByRole("region", { name: "Profile" })).toContainText("aoife@example.com");
  await page.goto("/settings?section=business");
  // The business details are read first, and changed in the house dialog (#141).
  const details = page.getByRole("region", { name: "Business details" });
  await expect(details).toContainText("Checkwork Motors");
  await details.getByRole("button", { name: "Edit business details" }).click();
  await expect(page.getByRole("dialog", { name: "Business details" }).getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Checkwork Motors");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Team" })).toHaveCount(0); // one section at a time
  await expect(page.getByRole("region", { name: "Your plan" })).toHaveCount(0); // in Billing now, with a link
  await expect(page.getByRole("main").getByRole("link", { name: "Billing", exact: true })).toHaveAttribute("href", "/billing");
  await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Connected services", exact: true }).click();
  await expect(page).toHaveURL(/section=services/);
  const social = page.getByRole("row", { name: /Facebook and Instagram posting/ });
  // The three outward services are simulated on the demo, so they read as connected; lead email shows its true state.
  await expect(social).toContainText("Connected");
  await expect(social).toContainText("@checkworkmotors");
  await expect(page.getByRole("row", { name: /Lead email/ })).toContainText("Not connected");
  // WhatsApp's own panel: the number, connected, this month's messages (#142).
  const wa = page.getByRole("region", { name: "WhatsApp", exact: true });
  await expect(wa).toContainText("Checkwork Motors on WhatsApp");
  await expect(wa).toContainText("Messages this month");
  // Website keys are Checkwork's, made through the owner API (#118): nothing about them here.
  await expect(page.getByText("For your web developer")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Website connection" })).toHaveCount(0);
});

test("on a phone the tab row opens scrolled to the open section", async ({ page }) => {
  await page.goto("/settings?section=services");
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Connected services", exact: true })).toBeInViewport({ ratio: 1 });
});

test("the plan's rules we set are in Billing", async ({ page }) => {
  await page.goto("/billing");
  await expect(page.getByRole("region", { name: "What we set for you" })).toContainText("Old stock after");
});

test("Sales and Finance have their own account only: the dealership's sections send them back to it", async ({ page, context }) => {
  for (const role of ["Sales", "Finance"]) {
    await as(context, role);
    for (const section of ["?section=targets", "?section=team", "?section=routing", "?section=marketing", "?section=services", "?section=limits", "?section=demo"]) {
      await page.goto(`/settings${section}`);
      await expect(page, `${role} ${section}`).toHaveURL(/\/settings$/);
      await expect(page.getByRole("region", { name: "Profile" })).toBeVisible();
    }
    const tabs = page.getByRole("navigation", { name: "Settings" }).getByRole("link");
    await expect(tabs).toHaveText(["Profile", "Notifications"].map((t) => new RegExp(`^${t}`)));
    await page.goto("/settings?section=emails");
    await expect(page.getByRole("region", { name: "Notifications on this device" })).toBeVisible();
    // Finance has no WhatsApp column; Sales has one, with a phone on their profile.
    await page.getByRole("button", { name: "Edit your notifications" }).click();
    const grid = page.getByRole("dialog", { name: "Notifications" });
    await expect(grid.getByRole("checkbox", { name: "WhatsApp" }).first()).toHaveCount(role === "Sales" ? 1 : 0);
    page.once("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
  }
});

test("your own notifications: tick a channel, save, and the page reads it back", async ({ page, context }) => {
  await as(context, "Manager"); // its own person, so the owner's choices other specs read stay as they are
  await page.goto("/settings?section=emails");
  await page.getByRole("button", { name: "Edit your notifications" }).click();
  const grid = page.getByRole("dialog", { name: "Notifications" });
  const box = grid.getByRole("group", { name: "New Google review" }).getByRole("checkbox", { name: "WhatsApp" });
  const was = await box.isChecked();
  await box.setChecked(!was);
  await grid.getByRole("button", { name: "Save" }).click();
  await expect(grid).toBeHidden();
  const line = page.getByRole("region", { name: "What reaches you" }).getByRole("term").filter({ hasText: "New Google review" }).locator("xpath=following-sibling::dd[1]");
  await expect(line).toHaveText(was ? "Off" : "WhatsApp");
  // Put it back.
  await page.getByRole("button", { name: "Edit your notifications" }).click();
  await grid.getByRole("group", { name: "New Google review" }).getByRole("checkbox", { name: "WhatsApp" }).setChecked(was);
  await grid.getByRole("button", { name: "Save" }).click();
  await expect(grid).toBeHidden();
});
