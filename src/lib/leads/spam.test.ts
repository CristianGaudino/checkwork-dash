import { describe, expect, it } from "vitest";
import { spamCheck } from "./spam";

const check = (message: string, name = "Mary Byrne", ownSite?: string) => spamCheck({ name, message }, ownSite);

describe("the spam check on a lead as it arrives (#56)", () => {
  it("never files a real customer as spam: any name, any language, short, empty, an email, links to cars and photos", () => {
    const ok: [string, string?][] = [
      ["Is the 2019 Golf still available? I could view it Saturday."],
      ["Call me."],
      [""],
      ["Hello", "Seán Ó Briain"],
      ["Hi, is the Tucson still for sale?", "Seo-yeon Park"],
      ["Bonjour, la voiture est-elle toujours disponible ?", "Aleksandra Wiśniewska-Kowalczyk"],
      ["请问这辆车还在吗", "李伟"],
      ["Здравствуйте, машина ещё продаётся?", "Дмитрий"],
      ["Interested in the Ford Escort, can I book a test drive? Two slots would suit."],
      ["My email is john.murphy@gmail.com, I prefer email to calls."],
      ["Email:mary@gmail.com"],
      ["Reach me at email:mary@gmail.com or mailto:mary@gmail.com"],
      ["Saw this on DoneDeal: https://www.donedeal.ie/cars-for-sale/vw-golf-2019/12345678 is it the same car?"],
      ["Ready to buy now. Photos of my trade-in: https://imgur.com/a/b"],
      ["My trade-in is a 12-D-xxx Corolla, photos https://imgur.com/a/b"],
      ["Photos of my trade-in", "Seo-yeon Park"],
      ["Photos: https://photos.app.goo.gl/AbCdEf123 and https://www.dropbox.com/s/x and https://we.tl/t-abc"],
      ["Like these: https://www.cargurus.ie/a https://www.carsales.com/b https://www.motors.co.uk/c, have you anything similar?"],
      ["What finance would I get on 48 months with 10% down? I earn 45k."],
      ["Is there room on the price for cash? Limited time offer from the bank, I can buy now if you click here on a deal."],
      ["Our SEO team has a question about your opening hours."], // "SEO" alone is a job, or a surname
      ["Dad and I (Mr Seo) want to see it this weekend."],
    ];
    for (const [message, name] of ok) expect(check(message, name), message).toBeUndefined();
    expect(check("Is this one still for sale? https://www.murphymotors.ie/cars/golf-2019", "Mary", "https://www.murphymotors.ie")).toBeUndefined();
  });

  it("at most asks a person (Possible spam) about a buyer with one odd word or unknown links", () => {
    const maybe: [string, string?][] = [
      ["I want to buy now, do you take crypto?"],
      ["Photos of my trade-in https://pics.example.org/123", "Seo-yeon Park"],
      ["Three I liked: https://a.example.net/1 https://b.example.net/2 https://c.example.net/3"],
      ["We offer high quality backlinks and guest posts at great prices."], // a pitch with no link: a person decides
      // A signature pasted under a real enquiry: a job title, a surname, a footer, a company site.
      ["Is the Tucson still for sale?\n\nSeo-yeon Park, Marketing Lead, www.acme-ltd.com\nTo unsubscribe from our mailing list, reply STOP"],
      ["Can I view it Saturday?\nMin-jun Seo, Head of SEO & Digital Marketing, brightwave.com"],
      ["Can I view Saturday? Aoife Kelly | Digital Marketing Manager | kellyco.com | Unsubscribe"],
      ["Dad and I (Mr Seo) want to see it. We run a casino-themed bar, www.luckybar.com"],
      ["Trade buyer, interested in the Golf", "Pat Kelly, KellyAuto.com"], // a company in the name
      ["Interested?", "Get backlinks https://linkfarm.top"],
    ];
    for (const [message, name] of maybe) expect(check(message, name), message).toBe("maybe");
  });

  it("at most asks a person about a pitch, however strong, and a real buyer with two odd words (Possible spam)", () => {
    const maybe: [string, string?][] = [
      ["Hi website owner, we can get your site to the first page of Google. Free SEO audit: https://best-seo-agency.xyz/audit"],
      ["Cheap backlinks and guest posts: https://linkfarm.top"],
      ["Earn 5000 USDT a day, guaranteed profits: http://quick-profit.top"],
      ["Interested?", "www.cheap-seo.com"],
      ["Trade buyer here", "KellyAuto.com"],
      ["Check this out https://goo.gl/abcd backlinks and guest posts cheap"],
      ["Get more leads https://wa.me:x@evil.xyz backlinks guest posts"], // the host is evil.xyz, not wa.me
      ["https://www.wa.me:a.b@evil.xyz"],
      ["https://wa.me:x-y@evil.xyz and https://wa.me:x+y@evil.xyz"],
      ["https://evil.xyz\\@wa.me"], // a browser reads "\\" as "/": evil.xyz
      ["Backlinks and guest posts: https://user@evil.xyz/path"],
      ["Can I pay part of the deposit in bitcoin?\nAoife Kelly, Digital Marketing Manager, kellyco.com"],
      ["I hit the jackpot finding this one! Similar to https://www.otherdealer.ie/cars/123 - do you take crypto at all?"],
    ];
    for (const [message, name] of maybe) expect(check(message, name), message).toBe("maybe");
  });

  it("files clear spam only on link markup, which no person types into a contact form", () => {
    expect(check("[url=http://casino-wins.example]best casino bonus[/url]")).toBe("spam");
    expect(check('<a href="http://cheap-pills.example">cheap</a>')).toBe("spam");
  });
});
