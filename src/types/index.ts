import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
} from 'discord.js';

export interface Command {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

/**
 * Convención de customId: `prefijo:idDueño:arg1:arg2…`
 * El router comprueba que quien pulsa es el dueño antes de llamar al handler,
 * y pasa solo los argumentos posteriores al id del dueño.
 */
export interface ComponentHandler {
  prefix: string;
  execute(interaction: ComponentInteraction, args: string[]): Promise<void>;
}

/** Mensaje listo para enviar/editar. */
export interface View {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}
