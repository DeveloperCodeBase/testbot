using Newtonsoft.Json;

public class InputData
{
    public List<double> Values { get; set; } = new();
}

public class OutputData
{
    public double Sum { get; set; }
    public double Average { get; set; }
    public double Min { get; set; }
    public double Max { get; set; }
}

class Program
{
    static void Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.WriteLine("Usage: ReportWorker <input-json> <output-json>");
            return;
        }

        string inputFile = args[0];
        string outputFile = args[1];

        if (!File.Exists(inputFile))
        {
            Console.WriteLine($"Input file not found: {inputFile}");
            return;
        }

        string json = File.ReadAllText(inputFile);
        var input = JsonConvert.DeserializeObject<InputData>(json);

        if (input == null || input.Values == null || input.Values.Count == 0)
        {
            Console.WriteLine("No values to process");
            return;
        }

        var output = new OutputData
        {
            Sum = input.Values.Sum(),
            Average = input.Values.Average(),
            Min = input.Values.Min(),
            Max = input.Values.Max()
        };

        string outputJson = JsonConvert.SerializeObject(output, Formatting.Indented);
        File.WriteAllText(outputFile, outputJson);

        Console.WriteLine($"Processed {input.Values.Count} values. Results written to {outputFile}");
    }
}
