import { describe, expect, it } from "vitest";
import { spamCheck } from "./spam";

const check = (message: string, name = "Mary Byrne", ownSite?: string) => spamCheck({ name, message }, ownSite);

describe("the spam check on a lead as it arrives (#56)", () => {
  it("never marks a real customer: any name, any language, short, empty, an email or a link to a car", () => {
    const real: [string, string?][] = [
      ["Is the 2019 Golf still available? I could view it Saturday."],
      ["Call me."],
      [""],
      ["Hello", "Seán Ó Briain"],
      ["Bonjour, la voiture est-elle toujours disponible ?", "Aleksandra Wiśniewska-Kowalczyk"],
      ["请问这辆车还在吗", "李伟"],
      ["Здравствуйте, машина ещё продаётся?", "Дмитрий"],
      ["Interested in the Ford Escort, can I book a test drive? Two slots would suit."],
      ["My email is john.murphy@gmail.com, I prefer email to calls."],
      ["Saw this on DoneDeal: https://www.donedeal.ie/cars-for-sale/vw-golf-2019/12345678 is it the same car?"],
      ["Photos of my trade-in: https://photos.app.goo.gl/AbCdEf123"],
      ["Location? https://maps.app.goo.gl/xyz"],
      ["What finance would I get on 48 months with 10% down? I earn 45k."],
      ["Do you have a 1.6 TDI estate, around 15k? Full service history please."],
      ["Is there room on the price for cash? I can pay a deposit today."],
    ];
    for (const [message, name] of real) expect(check(message, name), message).toBeUndefined();
    expect(check("Is this one still for sale? https://www.murphymotors.ie/cars/golf-2019", "Mary", "https://www.murphymotors.ie")).toBeUndefined();
  });

  it("marks clear spam: pitches with a link, two pitch words, forum links, a web address for a name, many links", () => {
    const spam: [string, string?][] = [
      ["Hi website owner, we can get your site to the first page of Google. Free SEO audit: https://best-seo-agency.xyz/audit"],
      ["We offer high quality backlinks and guest posts at great prices. Reply to this message."],
      ["Earn 5000 USDT a day with our crypto platform http://quick-profit.top"],
      ["[url=http://casino-wins.example]best casino bonus[/url]"],
      ['<a href="http://cheap-pills.example">cheap</a>'],
      ["Interested?", "Get backlinks https://linkfarm.top"],
      ["Check www.site-a.ru www.site-b.ru and www.site-c.ru today"],
      ["Increase your website traffic with our digital marketing team, guaranteed results!"],
      ["Bitcoin investment opportunity, guaranteed returns of 30% a month."],
    ];
    for (const [message, name] of spam) expect(check(message, name), message).toBe("spam");
  });

  it("is unsure, so a person decides, with one pitch word or one link to an unknown site", () => {
    expect(check("Do you take bitcoin?")).toBe("maybe");
    expect(check("Here are photos of my car https://imgur.com/a/xyz123")).toBe("maybe");
    expect(check("Our SEO team has a question about your opening hours.")).toBe("maybe");
  });
});
