class DicePF2e {

  /**
   * A standardized helper function for managing core PF2e "d20 rolls"
   *
   * Holding SHIFT, ALT, or CTRL when the attack is rolled will "fast-forward".
   * This chooses the default options of a normal attack with no bonus, Advantage, or Disadvantage respectively
   *
   * @param {Event} event           The triggering event which initiated the roll
   * @param {Array} parts           The dice roll component parts, excluding the initial d20
   * @param {Actor} actor           The Actor making the d20 roll
   * @param {Object} data           Actor or item data against which to parse the roll
   * @param {String} template       The HTML template used to render the roll dialog
   * @param {String} title          The dice roll UI window title
   * @param {Object} speaker        The ChatMessage speaker to pass when creating the chat
   * @param {Function} flavor       A callable function for determining the chat message flavor given parts and data
   * @param {Boolean} advantage     Allow rolling with advantage (and therefore also with disadvantage)
   * @param {Boolean} situational   Allow for an arbitrary situational bonus field
   * @param {Boolean} fastForward   Allow fast-forward advantage selection
   * @param {Function} onClose      Callback for actions to take when the dialog form is closed
   * @param {Object} dialogOptions  Modal dialog options
   */
  static d20Roll({event, parts, data, template, title, speaker, flavor, advantage=true, situational=true,
                  fastForward=true, onClose, dialogOptions}) {

    // Inner roll function
    let rollMode = game.settings.get("core", "rollMode");
    let _roll = (parts, adv, form) => {
      let flav = ( flavor instanceof Function ) ? flavor(parts, data) : title;
      if (adv === 1) {
        parts[0] = ["2d20kh"];
        flav = `${title} (Fortune)`;
      }
      else if (adv === -1) {
        parts[0] = ["2d20kl"];
        flav = `${title} (Misfortune)`;
      }

      // Don't include situational bonus unless it is defined
      data['bonus'] = form ? form.find('[name="bonus"]').val() : 0;
      if (!data.bonus && parts.indexOf("@bonus") !== -1) parts.pop();

      // Execute the roll and send it to chat
      let roll = new Roll(parts.join("+"), data).roll();
      roll.toMessage({
        speaker: speaker,
        flavor: flav,
        rollMode: form ? form.find('[name="rollMode"]').val() : rollMode
      });
      return roll;
    };

    // Modify the roll and handle fast-forwarding
    parts = ["1d20"].concat(parts);
    if ( event.shiftKey ) return _roll(parts, 0);
    else if ( event.altKey ) return _roll(parts, 1);
    else if ( event.ctrlKey || event.metaKey ) return _roll(parts, -1);
    else parts = parts.concat(["@bonus"]);

    // Render modal dialog
    template = template || "systems/pf2e/templates/chat/roll-dialog.html";
    let dialogData = {
      formula: parts.join(" + "),
      data: data,
      rollMode: rollMode,
      rollModes: CONFIG.rollModes
    };
		let roll;
    renderTemplate(template, dialogData).then(html => {
      new Dialog({
          title: title,
          content: html,
          buttons: {
            advantage: {
              label: "Fortune",
              callback: html => roll = _roll(parts, 1, html)
            },
            normal: {
              label: "Normal",
              callback: html => roll = _roll(parts, 0, html)
            },
            disadvantage: {
              label: "Misfortune",
              callback: html => roll = _roll(parts, -1, html)
            }
          },
          default: "normal",
          close: html => {
            if ( onClose ) onClose(html, parts, data);
          }
        }, dialogOptions).render(true);
    });
  }

  /* -------------------------------------------- */

  /**
   * A standardized helper function for managing core 5e "d20 rolls"
   *
   * Holding SHIFT, ALT, or CTRL when the attack is rolled will "fast-forward".
   * This chooses the default options of a normal attack with no bonus, Critical, or no bonus respectively
   *
   * @param {Event} event           The triggering event which initiated the roll
   * @param {Array} parts           The dice roll component parts, excluding the initial d20
   * @param {Actor} actor           The Actor making the damage roll
   * @param {Object} data           Actor or item data against which to parse the roll
   * @param {String} template       The HTML template used to render the roll dialog
   * @param {String} title          The dice roll UI window title
   * @param {Object} speaker        The ChatMessage speaker to pass when creating the chat
   * @param {Function} flavor       A callable function for determining the chat message flavor given parts and data
   * @param {Boolean} critical      Allow critical hits to be chosen
   * @param {Function} onClose      Callback for actions to take when the dialog form is closed
   * @param {Object} dialogOptions  Modal dialog options
   */
  static damageRoll({event={}, parts, actor, data, template, title, speaker, flavor, critical=false, onClose, dialogOptions}) {

    // Inner roll function
    let rollMode = game.settings.get("core", "rollMode");
		let rolled = false;
    let _roll = (parts, crit, form) => {
      data['bonus'] = form ? form.find('[name="bonus"]').val() : 0;
      let roll = new Roll(parts.join("+"), data),
          flav = ( flavor instanceof Function ) ? flavor(parts, data) : title;
      /* if ( crit ) {
        let add = 0;
        let mult = 2;
        roll.alter(add, mult);
        flav = `${title} (Critical)`;
      } */

      // Execute the roll and send it to chat
      roll.toMessage({
        speaker: speaker,
        flavor: flav,
        rollMode: form ? form.find('[name="rollMode"]').val() : rollMode
      });
			rolled = true;

      // Return the Roll object
      return roll;
    };

    // Modify the roll and handle fast-forwarding
    if ( event.shiftKey || event.ctrlKey || event.metaKey ) return _roll(parts, event.altKey);
    else parts = parts.concat(["@bonus"]);

    // Construct dialog data
    template = template || "systems/pf2e/templates/chat/roll-dialog.html";
    let dialogData = {
      formula: parts.join(" + "),
      data: data,
      rollMode: rollMode,
      rollModes: CONFIG.rollModes
    };

    // Render modal dialog
		let roll;
    return new Promise(resolve => {
      renderTemplate(template, dialogData).then(html => {
        new Dialog({
          title: title,
          content: html,
          buttons: {
            critical: {
              condition: critical,
              label: "Critical Hit",
              callback: html => roll = _roll(parts, true, html)
            },
            normal: {
              label: critical ? "Normal" : "Roll",
              callback: html => roll = _roll(parts, false, html)
            },
          },
          default: "normal",
          close: html => {
            if (onClose) onClose(html, parts, data);
            resolve(rolled ? roll : false);
          }
        }, dialogOptions).render(true);
      });
    });
  }


  alter(add, multiply) {
    let rgx = new RegExp(Roll.diceRgx, 'g');
    if ( this._rolled ) throw new Error("You may not alter a Roll which has already been rolled");

    // Update dice roll terms
    this.terms = this.terms.map(t => {
      return t.replace(rgx, (match, nd, d, mods) => {
        nd = (nd * (multiply || 1)) + (add || 0);
        mods = mods || "";
        return nd + "d" + d + mods;
      })
    });

    // Update the formula
    this._formula = this.terms.join(" ");
    return this;
  }

}

/**
 * Highlight critical success or failure on d20 rolls
 */
Hooks.on("renderChatMessage", (message, html, data) => {

  if ( !message.isRoll) return

  if ( message.roll.parts.length ) {
    let d = message.roll.parts[0];
    if ( d instanceof Die && d.faces === 20 ) {
      if (d.total === 20) html.find(".dice-total").addClass("success");
      else if (d.total === 1) html.find(".dice-total").addClass("failure");
    }
  }

  if (message.roll.parts[0].faces == 20 ) {
    if ( game.system.id === "pf2e" && message.data && message.data.flavor && message.data.flavor.endsWith("Skill Check")) {
      let btnStyling = 'width: 22px; height:22px; font-size:10px;line-height:1px';

      const setInitiativeButton = $(`<button class="dice-total-setInitiative-btn" style="${btnStyling}"><i class="fas fa-fist-raised" title="Click to set initiative to selected token(s)."></i></button>`);
      
      const btnContainer = $('<span class="dmgBtn-container" style="position:absolute; right:0; bottom:1px;"></span>');
      btnContainer.append(setInitiativeButton);
      
      html.find('.dice-total').append(btnContainer);

      setInitiativeButton.click(ev => {
          ev.stopPropagation(); 
          CONFIG.Actor.entityClass.setCombatantInitiative(html);
      });
    }
  }


});


