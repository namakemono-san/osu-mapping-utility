namespace MappingUtility.Checks.Framework;

public abstract class Check
{
    public abstract CheckMetadata GetMetadata();
    public abstract Dictionary<string, IssueTemplate> GetTemplates();

    public IssueTemplate GetTemplate(string name) => GetTemplates()[name];

    public override string ToString() => GetMetadata().Message;
}
